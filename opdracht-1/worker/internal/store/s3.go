package store

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"mime"
	"path"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/elmr1337/act-case/opdracht-1/worker/internal/config"
)

// S3 talks to any S3-compatible endpoint; tested against Hetzner Object
// Storage (path-style addressing, static credentials).
type S3 struct {
	cli    *s3.Client
	bucket string
}

func NewS3(cfg *config.Config) (*S3, error) {
	for name, v := range map[string]string{
		"S3_ENDPOINT":   cfg.S3Endpoint,
		"S3_REGION":     cfg.S3Region,
		"S3_BUCKET":     cfg.S3Bucket,
		"S3_ACCESS_KEY": cfg.S3AccessKey,
		"S3_SECRET_KEY": cfg.S3SecretKey,
	} {
		if v == "" {
			return nil, fmt.Errorf("STORE_DRIVER=s3 maar %s is leeg", name)
		}
	}
	cli := s3.New(s3.Options{
		Region:       cfg.S3Region,
		BaseEndpoint: aws.String(cfg.S3Endpoint),
		Credentials:  aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(cfg.S3AccessKey, cfg.S3SecretKey, "")),
		UsePathStyle: true,
	})
	return &S3{cli: cli, bucket: cfg.S3Bucket}, nil
}

func (s *S3) List(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	p := s3.NewListObjectsV2Paginator(s.cli, &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(prefix),
	})
	for p.HasMorePages() {
		page, err := p.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("s3 list %q: %w", prefix, err)
		}
		for _, obj := range page.Contents {
			keys = append(keys, aws.ToString(obj.Key))
		}
	}
	return keys, nil
}

func (s *S3) Read(ctx context.Context, key string) ([]byte, error) {
	out, err := s.cli.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("s3 read %q: %w", key, err)
	}
	defer out.Body.Close()
	return io.ReadAll(out.Body)
}

func (s *S3) Write(ctx context.Context, key string, data []byte) error {
	ct := mime.TypeByExtension(path.Ext(key))
	if ct == "" {
		ct = "application/octet-stream"
	}
	_, err := s.cli.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(ct),
	})
	if err != nil {
		return fmt.Errorf("s3 write %q: %w", key, err)
	}
	return nil
}

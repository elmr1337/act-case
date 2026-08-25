"use client";

import { useState } from "react";
import { ImageOff, Link2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FormField } from "@/lib/dto";

/**
 * Eén veld uit de template-configuratie, vertaald naar iets wat een niet-
 * technische gebruiker snapt. Alle waardes gaan als string terug naar de API —
 * dat is wat Storyteq's `template_parameters` verwacht.
 */
export function FieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.name}`;
  const describedBy = error ? `${id}-error` : hint(field) ? `${id}-hint` : undefined;

  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm font-medium">
        {field.label}
      </Label>

      <Control
        id={id}
        field={field}
        value={value}
        invalid={Boolean(error)}
        describedBy={describedBy}
        onChange={onChange}
      />

      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : (
        hint(field) && (
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            {hint(field)}
          </p>
        )
      )}
    </div>
  );
}

function hint(field: FormField): string | null {
  switch (field.kind) {
    case "image":
      return "Plak een link naar een afbeelding (jpg of png).";
    case "video":
      return "Plak een link naar een videobestand.";
    case "url":
      return "Bijvoorbeeld https://act.agency";
    case "color":
      return null;
    default:
      return null;
  }
}

type ControlProps = {
  id: string;
  field: FormField;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (value: string) => void;
};

function Control({ id, field, value, invalid, describedBy, onChange }: ControlProps) {
  const shared = {
    id,
    value,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy,
    className: cn(invalid && "border-destructive focus-visible:ring-destructive/30"),
  };

  switch (field.kind) {
    case "longtext":
      return (
        <Textarea
          {...shared}
          rows={4}
          placeholder={`${field.label}…`}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "color":
      return <ColorControl {...{ id, value, invalid, describedBy, onChange }} />;

    case "number":
      return (
        <Input
          {...shared}
          type="number"
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "boolean":
      return <BooleanControl {...{ id, value, onChange }} />;

    case "image":
    case "video":
      return (
        <MediaUrlControl
          {...{ id, value, invalid, describedBy, onChange }}
          kind={field.kind}
        />
      );

    case "url":
      return (
        <Input
          {...shared}
          type="url"
          inputMode="url"
          placeholder="https://"
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return (
        <Input
          {...shared}
          placeholder={field.placeholder ?? `${field.label}…`}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function ColorControl({
  id,
  value,
  invalid,
  describedBy,
  onChange,
}: Omit<ControlProps, "field">) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value);

  return (
    <div className="flex items-center gap-2">
      <label
        className="border-input relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-lg border"
        style={{ backgroundColor: isHex ? value : "transparent" }}
      >
        <span className="sr-only">Kleur kiezen</span>
        <input
          type="color"
          value={isHex ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        {!isHex && (
          <span
            aria-hidden
            className="bg-muted absolute inset-0 flex items-center justify-center text-[10px]"
          >
            #
          </span>
        )}
      </label>
      <Input
        id={id}
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder="#000000"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={cn("font-mono", invalid && "border-destructive")}
      />
    </div>
  );
}

function BooleanControl({
  id,
  value,
  onChange,
}: Pick<ControlProps, "id" | "value" | "onChange">) {
  const options = [
    { value: "true", label: "Ja" },
    { value: "false", label: "Nee" },
  ];
  const current = value === "true" ? "true" : "false";

  return (
    <div id={id} role="radiogroup" className="bg-muted inline-flex gap-1 rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={current === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            current === option.value
              ? "bg-card text-foreground shadow-paper"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** URL-veld met live preview: je ziet meteen of de link klopt. */
function MediaUrlControl({
  id,
  value,
  invalid,
  describedBy,
  onChange,
  kind,
}: Omit<ControlProps, "field"> & { kind: "image" | "video" }) {
  const [broken, setBroken] = useState(false);
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(value.trim());

  return (
    <div className="space-y-2">
      <div className="relative">
        <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          id={id}
          type="url"
          inputMode="url"
          value={value}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder="https://…"
          spellCheck={false}
          onChange={(e) => {
            setBroken(false);
            onChange(e.target.value);
          }}
          className={cn("pl-9", invalid && "border-destructive")}
        />
      </div>

      {looksLikeUrl && kind === "image" && (
        <div className="border-border bg-muted flex h-24 items-center justify-center overflow-hidden rounded-lg border">
          {broken ? (
            <span className="text-muted-foreground flex items-center gap-2 text-xs">
              <ImageOff className="size-4" />
              Deze link laat geen afbeelding zien
            </span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- vrije URL van de gebruiker
            <img
              src={value.trim()}
              alt=""
              className="size-full object-contain"
              onError={() => setBroken(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}

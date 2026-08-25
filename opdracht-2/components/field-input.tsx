"use client";

import { useState } from "react";
import { Check, ImageOff, Link2 } from "lucide-react";
import Image from "next/image";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { FieldOption, FormField } from "@/lib/dto";

/** Ruimer dan de shadcn-standaard: dit formulier is het hart van de app. */
const CONTROL = "h-12 rounded-xl text-base md:text-base";

export type FieldExamples = Record<string, string>;

/**
 * Eén veld uit de template-configuratie, vertaald naar iets wat een niet-
 * technische gebruiker snapt. Alle waardes gaan als string terug naar de API —
 * dat is wat Storyteq's `template_parameters` verwacht.
 */
export function FieldInput({
  field,
  value,
  error,
  valid,
  examples,
  onChange,
}: {
  field: FormField;
  value: string;
  error?: string;
  valid: boolean;
  /** Per keuzewaarde het id van een eerdere render die die keuze gebruikte. */
  examples?: FieldExamples;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.name}`;
  const hintText = hint(field);
  const describedBy = error ? `${id}-error` : hintText ? `${id}-hint` : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {field.label}
          {/* De meeste velden zijn optioneel; dan is het rustiger om alleen de
              verplichte te markeren in plaats van alle andere. */}
          {field.required && (
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">
              verplicht
            </span>
          )}
        </Label>

        {valid && !error && (
          <span
            className="bg-success/15 text-success flex size-5 items-center justify-center rounded-full"
            title="Ziet er goed uit"
          >
            <Check className="size-3" strokeWidth={3.5} />
            <span className="sr-only">Ingevuld</span>
          </span>
        )}
      </div>

      <Control
        id={id}
        field={field}
        value={value}
        invalid={Boolean(error)}
        valid={valid}
        describedBy={describedBy}
        examples={examples}
        onChange={onChange}
      />

      {error ? (
        <p id={`${id}-error`} className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : (
        hintText && (
          <p id={`${id}-hint`} className="text-muted-foreground text-xs">
            {hintText}
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
    default:
      return null;
  }
}

type ControlProps = {
  id: string;
  field: FormField;
  value: string;
  invalid: boolean;
  valid: boolean;
  describedBy?: string;
  examples?: FieldExamples;
  onChange: (value: string) => void;
};

function Control({
  id,
  field,
  value,
  invalid,
  valid,
  describedBy,
  examples,
  onChange,
}: ControlProps) {
  const shared = {
    id,
    value,
    "aria-invalid": invalid || undefined,
    "aria-describedby": describedBy,
    className: cn(
      CONTROL,
      invalid && "border-destructive focus-visible:ring-destructive/30",
      valid && !invalid && "border-success/40",
    ),
  };

  switch (field.kind) {
    case "select":
      return (
        <SelectControl
          id={id}
          value={value}
          options={field.options ?? []}
          invalid={invalid}
          valid={valid}
          describedBy={describedBy}
          examples={examples}
          onChange={onChange}
        />
      );

    case "longtext":
      return (
        <Textarea
          {...shared}
          rows={4}
          placeholder={`${field.label}…`}
          className={cn(shared.className, "h-auto min-h-28 py-3 leading-relaxed")}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "color":
      return (
        <ColorControl {...{ id, value, invalid, valid, describedBy, onChange }} />
      );

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
          {...{ id, value, invalid, valid, describedBy, onChange }}
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

/**
 * `type: "enum"` uit de API. Storyteq geeft bij een keuze alleen een label mee,
 * geen voorbeeldbeeld — "Green" of "parameterValue-93f1…" zegt op zichzelf
 * niets. Daarom zoeken we bij elke keuze een eerdere render die die waarde
 * gebruikte en tonen we díe als voorbeeld. Zie lib/history.ts.
 */
function SelectControl({
  id,
  value,
  options,
  invalid,
  valid,
  describedBy,
  examples,
  onChange,
}: Omit<ControlProps, "field"> & { options: FieldOption[] }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          "!h-12 w-full rounded-xl text-base",
          invalid && "border-destructive",
          valid && !invalid && "border-success/40",
        )}
      >
        <SelectValue placeholder="Maak een keuze…" />
      </SelectTrigger>

      <SelectContent>
        {options.map((option) => {
          const exampleId = examples?.[option.value];
          return (
            <SelectItem key={option.value} value={option.value} className="py-2">
              <span className="flex items-center gap-2.5">
                {exampleId && (
                  <span className="bg-muted relative size-8 shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={`/api/assets/${exampleId}/download?variant=thumbnail`}
                      alt=""
                      fill
                      sizes="32px"
                      className="object-cover"
                    />
                  </span>
                )}
                {option.label}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function ColorControl({
  id,
  value,
  invalid,
  valid,
  describedBy,
  onChange,
}: Omit<ControlProps, "field" | "examples">) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value);

  return (
    <div className="flex items-center gap-2">
      <label
        className="border-input relative size-12 shrink-0 cursor-pointer overflow-hidden rounded-xl border"
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
            className="bg-muted absolute inset-0 flex items-center justify-center text-xs"
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
        className={cn(
          CONTROL,
          "font-mono",
          invalid && "border-destructive",
          valid && !invalid && "border-success/40",
        )}
      />
    </div>
  );
}

function BooleanControl({
  id,
  value,
  onChange,
}: Pick<ControlProps, "id" | "value" | "onChange">) {
  const current = value === "true" ? "true" : "false";

  return (
    <div id={id} role="radiogroup" className="bg-muted inline-flex gap-1 rounded-xl p-1">
      {[
        { value: "true", label: "Ja" },
        { value: "false", label: "Nee" },
      ].map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={current === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-lg px-5 py-2.5 text-sm font-medium transition-colors",
            current === option.value
              ? "bg-card text-foreground shadow-sm"
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
  valid,
  describedBy,
  onChange,
  kind,
}: Omit<ControlProps, "field" | "examples"> & { kind: "image" | "video" }) {
  const [broken, setBroken] = useState(false);
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(value.trim());

  return (
    <div className="space-y-2">
      <div className="relative">
        <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
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
          className={cn(
            CONTROL,
            "pl-10",
            invalid && "border-destructive",
            valid && !invalid && "border-success/40",
          )}
        />
      </div>

      {looksLikeUrl && kind === "image" && (
        <div className="border-border bg-muted flex h-28 items-center justify-center overflow-hidden rounded-xl border">
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

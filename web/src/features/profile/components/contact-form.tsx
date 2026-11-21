"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platformOf } from "@/features/documents/icons";
import { type ContactFormState, saveContactAction } from "@/features/profile/contact-actions";

type Props = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: { label: string; url: string }[];
  /** The Google account's name and email, used when a field is left blank. */
  fallback: { name: string; email: string };
};

// Three empty rows to start; a row left blank is not saved.
const linkIdeas = ["", "", ""];

/** Name, contact details and links printed at the top of every resume and cover letter. */
export function ContactForm(props: Props) {
  const [state, action, pending] = useActionState<ContactFormState, FormData>(
    saveContactAction,
    {},
  );
  const [links, setLinks] = useState(() =>
    (props.links.length ? props.links : linkIdeas.map((url) => ({ label: "", url }))).map(
      (l, i) => ({ ...l, key: i }),
    ),
  );
  const [nextKey, setNextKey] = useState(links.length);

  const field = (
    name: keyof Omit<Props, "links" | "fallback">,
    label: string,
    placeholder: string,
    type = "text",
  ) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`contact-${name}`} className="font-medium">
        {label}
      </label>
      <Input
        id={`contact-${name}`}
        name={name}
        type={type}
        defaultValue={props[name]}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        {field("fullName", "Name on documents", props.fallback.name)}
        {field("email", "Email", props.fallback.email, "email")}
        {field("phone", "Phone", "e.g. 403-555-0100", "tel")}
        {field("location", "Location", "e.g. Calgary, AB")}
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-medium">Links</span>
        <div className="hidden grid-cols-[minmax(0,1fr)_10rem_2.25rem] gap-2 text-xs text-muted-foreground sm:grid">
          <span>Address</span>
          <span>Shown as (optional)</span>
        </div>
        {links.map((link, index) => {
          const platform = platformOf(
            /^https?:\/\//i.test(link.url) ? link.url : `https://${link.url}`,
          );
          return (
            <div
              key={link.key}
              className="grid grid-cols-[minmax(0,1fr)_10rem_2.25rem] items-center gap-2"
            >
              <Input
                name="linkUrl"
                value={link.url}
                onChange={(e) => {
                  const url = e.currentTarget.value;
                  setLinks(links.map((l) => (l.key === link.key ? { ...l, url } : l)));
                }}
                placeholder="linkedin.com/in/you"
                aria-label={`Link ${index + 1} address`}
              />
              <Input
                name="linkLabel"
                value={link.label}
                onChange={(e) => {
                  const label = e.currentTarget.value;
                  setLinks(links.map((l) => (l.key === link.key ? { ...l, label } : l)));
                }}
                placeholder={platform.name}
                aria-label={`Link ${index + 1} shown as`}
                maxLength={40}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove link ${index + 1}`}
                onClick={() => setLinks(links.filter((l) => l.key !== link.key))}
              >
                <X className="size-4" />
              </Button>
            </div>
          );
        })}
        {links.length < 8 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              setLinks([...links, { label: "", url: "", key: nextKey }]);
              setNextKey(nextKey + 1);
            }}
          >
            <Plus className="size-4" /> Add a link
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          A resume shows each link as its address (linkedin.com/in/you) or, if you choose labels in
          the resume builder, as the text under "Shown as": your handle, like "chjrussell", reads
          well next to the LinkedIn icon. Left blank, it shows the platform's name. Leave an address
          blank to skip it.
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Save contact details
        </Button>
        {state.error && (
          <p role="alert" className="text-destructive">
            {state.error}
          </p>
        )}
        {state.message && <p className="text-muted-foreground">{state.message}</p>}
      </div>
    </form>
  );
}

"use client";

import * as React from "react";
import { MapPin, Search } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type DeliveryAddress = {
  label?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  lat?: number;
  lng?: number;
  instructions?: string;
};

// Address entry for a rental, in the shape people already know from food
// delivery: type it, or drop a pin and have the fields filled in.
//
// Typing is the primary path and coordinates are optional. Someone who
// declines location, or is indoors with no fix, must still be able to give an
// address — so nothing here depends on the browser granting permission.
export function DeliveryAddressFields({
  value,
  onChange,
  disabled,
  heading = "Delivery address",
  hint,
}: {
  value: DeliveryAddress;
  onChange: (next: DeliveryAddress) => void;
  disabled?: boolean;
  heading?: string;
  hint?: string;
}) {
  const [locating, setLocating] = React.useState(false);
  const [locateError, setLocateError] = React.useState<string | null>(null);

  const set = (patch: Partial<DeliveryAddress>) => onChange({ ...value, ...patch });

  const useCurrentLocation = () => {
    setLocateError(null);
    if (!navigator.geolocation) {
      setLocateError("Your browser cannot share a location. Type the address instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          // Nominatim needs no key and no account. If it is unreachable the
          // coordinates are still kept — a pin with no street name is worth
          // more to whoever is delivering than nothing at all.
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`,
            { headers: { Accept: "application/json" } }
          );
          const data = await res.json();
          const a = data?.address ?? {};
          set({
            lat: latitude,
            lng: longitude,
            line1: [a.house_number, a.road].filter(Boolean).join(" ") || value.line1,
            line2: a.suburb || a.neighbourhood || value.line2,
            city: a.city || a.town || a.village || a.county || value.city,
            state: a.state || value.state,
            pincode: a.postcode || value.pincode,
          });
        } catch {
          set({ lat: latitude, lng: longitude });
          setLocateError("Found your position but could not look up the street. Please fill in the address.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setLocateError("Could not get your location. Type the address instead.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <MapPin size={16} className="text-muted-foreground" />
            {heading}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={locating}
          disabled={disabled}
          onClick={useCurrentLocation}
        >
          <Search size={14} className="mr-1.5" />
          Use my location
        </Button>
      </div>

      {locateError && <p className="text-xs text-muted-foreground">{locateError}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Flat / house no, building"
            value={value.line1 ?? ""}
            onChange={(e) => set({ line1: e.target.value })}
            disabled={disabled}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            label="Area, street, landmark"
            value={value.line2 ?? ""}
            onChange={(e) => set({ line2: e.target.value })}
            disabled={disabled}
          />
        </div>
        <Input
          label="City"
          value={value.city ?? ""}
          onChange={(e) => set({ city: e.target.value })}
          disabled={disabled}
          required
        />
        <Input
          label="State"
          value={value.state ?? ""}
          onChange={(e) => set({ state: e.target.value })}
          disabled={disabled}
        />
        <Input
          label="PIN code"
          inputMode="numeric"
          value={value.pincode ?? ""}
          onChange={(e) => set({ pincode: e.target.value })}
          disabled={disabled}
          required
        />
        <Input
          label="Save as (e.g. Home)"
          value={value.label ?? ""}
          onChange={(e) => set({ label: e.target.value })}
          disabled={disabled}
        />
        <div className="sm:col-span-2">
          <Input
            label="Delivery instructions (optional)"
            placeholder="Ring the second bell, gate code 1234…"
            value={value.instructions ?? ""}
            onChange={(e) => set({ instructions: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>

      {value.lat !== undefined && value.lng !== undefined && (
        <p className="text-xs text-muted-foreground">
          Pinned at {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}

// The minimum an address must have to be worth sending to an owner.
export function isAddressComplete(a: DeliveryAddress) {
  return Boolean(a.line1?.trim() && a.city?.trim() && a.pincode?.trim());
}

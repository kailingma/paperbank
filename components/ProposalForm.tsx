import { currencyDecimals } from "@/lib/money";

export type ItemDefault = {
  name: string;
  qty: number;
  unitMajor: string;
  taxable: boolean;
  url: string;
};

export function ProposalForm({
  action,
  currency,
  defaults,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  currency: string;
  defaults: { title: string; reason: string; items: ItemDefault[] };
  submitLabel: string;
}) {
  const d = currencyDecimals(currency);
  const rows: ItemDefault[] = Array.from(
    { length: 8 },
    (_, i) =>
      defaults.items[i] ?? {
        name: "",
        qty: 1,
        unitMajor: "",
        taxable: false,
        url: "",
      },
  );
  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        Title
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={defaults.title}
          className="rounded-md border bg-transparent px-3 py-2"
        />
      </label>
      <label className="grid gap-1 text-sm">
        Reason (optional)
        <textarea
          name="reason"
          maxLength={2000}
          defaultValue={defaults.reason}
          rows={2}
          className="rounded-md border bg-transparent px-3 py-2"
        />
      </label>
      <div className="grid gap-2">
        <p className="text-sm font-medium">
          Items (leave unused rows blank) · {currency}
          {d === 0 ? " · no cents" : ""}
        </p>
        {rows.map((it, i) => (
          <fieldset
            key={i}
            className="grid grid-cols-12 gap-2 rounded-lg border p-2"
          >
            <input
              name={`item-name-${i}`}
              placeholder={`Item ${i + 1} name`}
              maxLength={200}
              defaultValue={it.name}
              className="col-span-12 rounded border bg-transparent px-2 py-1 text-sm sm:col-span-5"
            />
            <input
              name={`item-qty-${i}`}
              type="number"
              min={1}
              defaultValue={it.qty}
              title="Qty"
              className="col-span-3 rounded border bg-transparent px-2 py-1 text-sm sm:col-span-2"
            />
            <input
              name={`item-unit-${i}`}
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={it.unitMajor}
              title="Unit price"
              className="col-span-5 rounded border bg-transparent px-2 py-1 text-sm sm:col-span-2"
            />
            <label className="col-span-4 flex items-center gap-1 text-xs sm:col-span-1">
              <input
                name={`item-taxable-${i}`}
                type="checkbox"
                defaultChecked={it.taxable}
              />
              Tax?
            </label>
            <input
              name={`item-url-${i}`}
              placeholder="Link (optional)"
              maxLength={500}
              defaultValue={it.url}
              className="col-span-12 rounded border bg-transparent px-2 py-1 text-sm sm:col-span-2"
            />
          </fieldset>
        ))}
      </div>
      <button
        type="submit"
        className="rounded-md border px-4 py-2 text-sm font-medium"
      >
        {submitLabel}
      </button>
    </form>
  );
}

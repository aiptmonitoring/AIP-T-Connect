'use client';
import TablePagination from '../../src/components/TablePagination';
import ActionIcon from '../../src/components/ActionIcon';


import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchSupabaseFunction,
  getSupabaseBrowserClient,
} from "../../src/lib/supabase/browser";
import QRCode from "qrcode";
import "./quotation.css";

type Category = "Trademark" | "Patent" | "Design" | "Copyright" | "Others";
type Country = {
  id: string;
  name: string;
  abbreviation: string;
  flag_url: string;
};
type Client = {
  id: string;
  assigned_id: number;
  company_name: string;
  email: string;
  address: string;
  country_id: string;
  status: "Active" | "Inactive";
};
type Project = {
  id: string;
  client_id: string;
  project_name: string;
  aipt_ref_no: string;
};
type Procedure = { id: string; name: string; category: Category };
type Requirement = {
  id: string;
  country_id: string;
  service_id?: string | null;
  procedure_id?: string | null;
  procedure: string | null;
  description: string;
};
type AddonFee = {
  country_id: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
  currency?: string;
  procedure_name?: string;
};
type Fee = {
  id: string;
  country_id: string;
  category: Category;
  procedure_name: string;
  official_fee: number;
  attorney_fee: number;
  total_fee: number;
};
type Lookup = {
  role?: "administrator" | "client";
  current_client_id?: string | null;
  clients: Client[];
  services: Array<{ id: string; name: string; category: string; description: string }>;
  projects: Project[];
  countries: Country[];
  procedures: Procedure[];
  requirements: Requirement[];
  fees: Fee[];
  claiming_priority_fees: AddonFee[];
  state_fees: AddonFee[];
  aripo_country_ids: string[];
  vat_rates: Array<{ country_id: string; vat: number }>;
};
type QuoteItem = {
  country_id: string;
  category: Category;
  procedure_name: string;
  quantity: number;
  class_numbers?: number[];
  class_type?: "Single" | "Multi" | null;
  class_count?: number;
  additional_fee_per_class?: number;
  requirement_ids: string[];
  official_fee: number;
  attorney_fee: number;
  other_fee: number;
  vat_rate: number;
  claiming_priority?: boolean;
  claiming_priority_fee?: number;
  state_country_ids?: string[];
  state_fee_total?: number;
};
type Quotation = {
  id: string;
  reference_no: string;
  invoice_verification_token?: string;
  status: string;
  vat_rate: number;
  vatable: boolean;
  currency: string;
  client_matter_ref?: string;
  invoice_date: string;
  subject: string;
  discount: number;
  total_official_fee: number;
  total_attorney_fee: number;
  total_other_fee: number;
  total_vat: number;
  grand_total: number;
  created_at: string;
  client?: Client;
  project?: Project;
  primary_country?: Country;
  quotation_items: QuoteItem[];
};
type ListResponse = { data: Quotation[]; total: number };

const categories: Category[] = [
  "Trademark",
  "Patent",
  "Design",
  "Copyright",
  "Others",
];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
const dateText = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
const validFlagUrl = (value?: string | null) =>
  typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";
const emptyLookup: Lookup = {
  clients: [],
  services: [],
  projects: [],
  countries: [],
  procedures: [],
  requirements: [],
  fees: [],
  claiming_priority_fees: [],
  state_fees: [],
  aripo_country_ids: [],
  vat_rates: [],
};
const blankItem = (category: Category = "Trademark"): QuoteItem => ({
  country_id: "",
  category,
  procedure_name: "",
  quantity: 1,
  class_numbers: [],
  requirement_ids: [],
  official_fee: 0,
  attorney_fee: 0,
  other_fee: 0,
  vat_rate: 0,
  claiming_priority: false,
  claiming_priority_fee: 0,
  state_country_ids: [],
  state_fee_total: 0,
});

function generateInvoiceSubject({
  item,
  clientName,
  countryName,
}: {
  item: QuoteItem;
  clientName: string;
  countryName: string;
}) {
  const applicant = clientName || "[applicant]";
  const country = countryName || "[country]";
  const procedure = item.procedure_name || "[procedure]";
  return `${procedure} in ${country}.`;
}

export default function QuotationsPage() {
  const [lookup, setLookup] = useState<Lookup>(emptyLookup);
  const [rows, setRows] = useState<Quotation[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize,setPageSize]=useState(10);
  const [ascending,setAscending]=useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [total, setTotal] = useState(0);
  const [modal, setModal] = useState<"form" | "view" | "delete" | null>(null);
  const [feeModal, setFeeModal] = useState(false);
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [clientId, setClientId] = useState("");
    const [projectId, setProjectId] = useState("");
  const [clientMatterRef, setClientMatterRef] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [subject, setSubject] = useState("");
  const [vatable, setVatable] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [category, setCategory] = useState<Category>("Trademark");
  const [countryIds, setCountryIds] = useState<string[]>([]);
  const [procedureNames, setProcedureNames] = useState<string[]>([]);
  const [requirementIds, setRequirementIds] = useState<string[]>([]);
  const [selectedClassNumbers, setSelectedClassNumbers] = useState<number[]>([]);
  const [classCount, setClassCount] = useState(0);
  const [cart, setCart] = useState<QuoteItem[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verificationQr, setVerificationQr] = useState("");

  const api = useCallback(async <T,>(path: string, init: RequestInit = {}) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) throw Error("Supabase is not configured.");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) throw Error("Please sign in to manage quotations.");
    const response = await fetchSupabaseFunction(path, {
      ...init,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    const body =
      response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw Error(body?.error || "Quotation request failed.");
    return body as T;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        direction:ascending?"asc":"desc",
      });
      if (search.trim()) params.set("search", search.trim());
      if (status) params.set("status", status);
      const [list, data] = await Promise.all([
        api<ListResponse>(`quotations?${params}`),
        api<Lookup>("quotations?lookup=true"),
      ]);
      setRows(list?.data ?? []);
      setTotal(list?.total ?? 0);
      const normalizedLookup: Lookup = {
        ...emptyLookup,
        ...(data ?? {}),
        claiming_priority_fees: data?.claiming_priority_fees ?? [],
        state_fees: data?.state_fees ?? [],
        aripo_country_ids: data?.aripo_country_ids ?? [],
      };
      setLookup(normalizedLookup);
      if (data?.role === "client" && data.current_client_id) {
        setClientId(data.current_client_id);
      }
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load quotations.",
      );
    } finally {
      setLoading(false);
    }
  }, [api, page, search, status, pageSize, ascending]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!selected?.invoice_verification_token || modal !== "form") {
      setVerificationQr("");
      return;
    }
    void QRCode.toDataURL(`${window.location.origin}/invoice/verify/${selected.invoice_verification_token}`, { width: 180, margin: 2, errorCorrectionLevel: "H" })
      .then(setVerificationQr)
      .catch(() => setVerificationQr(""));
  }, [modal, selected]);

  const client = lookup.clients.find((item) => item.id === clientId);
  const isClientRole = lookup.role === "client";
  const projects = lookup.projects.filter(
    (item) => item.client_id === clientId,
  );
  const serviceNames = lookup.services.map((service) => service.name.trim().toLowerCase());
  const availableCategories = categories.filter((item) =>
    serviceNames.includes(item.toLowerCase()),
  );
  const serviceOptions = lookup.services
    .filter((service) => availableCategories.includes(service.name as Category))
    .map((service) => ({ id: service.id, name: service.name }));
  const selectedService = serviceOptions.find((service) => service.name === category);
  // Procedure availability follows the service catalog, independently of country rates.
  const availableProcedures = lookup.procedures.filter(
    (item) => item.category === category,
  );
  const availableRequirements = lookup.requirements.filter(
    (item) =>
      Boolean(selectedService?.id) &&
      countryIds.length > 0 &&
      procedureNames.length > 0 &&
      item.service_id === selectedService?.id &&
      countryIds.includes(item.country_id) &&
      Boolean(item.procedure_id) &&
      procedureNames.some((procedureName) =>
        availableProcedures.some((procedure) => procedure.name === procedureName && procedure.id === item.procedure_id),
      ),
  );
  const generatedFees = countryIds.flatMap((countryId) =>
    procedureNames
      .map((procedureName) =>
        lookup.fees.find(
          (fee) =>
            fee.country_id === countryId &&
            fee.category === category &&
            fee.procedure_name === procedureName,
        ),
      )
      .filter((fee): fee is Fee => Boolean(fee)),
  );
  const allExactFeesFound =
    generatedFees.length === countryIds.length * procedureNames.length &&
    generatedFees.length > 0;
  const roundFee = (value: number) => Math.round(Math.max(0, value) * 100) / 100;
  const withSnapshot = (fee: Fee, quantity = 1): QuoteItem => ({
    country_id: fee.country_id,
    category,
    procedure_name: fee.procedure_name,
    quantity,
    class_numbers: category === "Trademark" ? selectedClassNumbers : [],
    class_type: category === "Trademark" && selectedClassNumbers.length > 0 ? (selectedClassNumbers.length === 1 ? "Single" : "Multi") : null,
    class_count: category === "Trademark" ? classCount : 0,
    additional_fee_per_class: 0,
    requirement_ids: requirementIds.filter((id) =>
      availableRequirements.some((item) => item.id === id && item.country_id === fee.country_id && availableProcedures.some((procedure) => procedure.id === item.procedure_id && procedure.name === fee.procedure_name)),
    ),
    official_fee: roundFee(fee.official_fee * quantity * Math.max(1, selectedClassNumbers.length)),
    attorney_fee: roundFee(fee.attorney_fee * quantity * Math.max(1, selectedClassNumbers.length)),
    other_fee: roundFee(roundFee(fee.total_fee) * quantity * Math.max(1, selectedClassNumbers.length) - roundFee(fee.official_fee * quantity * Math.max(1, selectedClassNumbers.length)) - roundFee(fee.attorney_fee * quantity * Math.max(1, selectedClassNumbers.length))),
    vat_rate: lookup.vat_rates.find((rate) => rate.country_id === fee.country_id)?.vat ?? 0,
    claiming_priority: false,
    claiming_priority_fee: 0,
    state_country_ids: [],
    state_fee_total: 0,
  });
  const previewItems = cart;
  const officialTotal = previewItems.reduce(
    (sum, item) => sum + item.official_fee,
    0,
  );
  const attorneyTotal = previewItems.reduce(
    (sum, item) => sum + item.attorney_fee,
    0,
  );
  const otherTotal = previewItems.reduce(
    (sum, item) =>
      sum + item.other_fee + (item.claiming_priority_fee ?? 0) + (item.state_fee_total ?? 0),
    0,
  );
  const vatTotal = vatable
    ? previewItems.reduce((sum, item) => sum + (item.attorney_fee * item.vat_rate) / 100, 0)
    : 0;
  const grandTotal = Math.max(
    0,
    officialTotal + attorneyTotal + otherTotal + vatTotal - discount,
  );
  const countrySummary: Array<{
    country: string;
    flag: string;
    official: number;
    attorney: number;
    vat: number;
    discount: number;
    total: number;
  }> = Object.values(
    cart.reduce((accumulator, item) => {
      const key = item.country_id;
      const country = lookup.countries.find((countryItem) => countryItem.id === key);
      if (!accumulator[key]) {
        accumulator[key] = {
          country: country?.name ?? "-",
          flag: country?.flag_url ?? "",
          official: 0,
          attorney: 0,
          vat: 0,
          discount: 0,
          total: 0,
        };
      }
      const row = accumulator[key];
      row.official += item.official_fee;
      row.attorney += item.attorney_fee;
      row.vat += vatable ? (item.attorney_fee * item.vat_rate) / 100 : 0;
      row.total += item.official_fee + item.attorney_fee + item.other_fee + (item.claiming_priority_fee ?? 0) + (item.state_fee_total ?? 0) + (vatable ? (item.attorney_fee * item.vat_rate) / 100 : 0) - (row.discount || 0);
      return accumulator;
    }, {} as Record<string, {
      country: string;
      flag: string;
      official: number;
      attorney: number;
      vat: number;
      discount: number;
      total: number;
    }>),
  ) as Array<{
    country: string;
    flag: string;
    official: number;
    attorney: number;
    vat: number;
    discount: number;
    total: number;
  }>;

  const resetForm = () => {
    setClientId(isClientRole ? lookup.current_client_id ?? "" : "");
    setProjectId("");
    setClientMatterRef("");
    setInvoiceDate(today());
    setSubject("");
    setVatable(true);
    setDiscount(0);
    setCategory("Trademark");
    setCountryIds([]);
    setProcedureNames([]);
    setRequirementIds([]);
    setSelectedClassNumbers([]);
    setClassCount(0);
    setCart([]);
  };
  const openNew = () => {
    setSelected(null);
    resetForm();
    setError("");
    setModal("form");
  };
  const openEdit = (quote: Quotation) => {
    setSelected(quote);
    setClientId(quote.client?.id ?? "");
      setProjectId(quote.project?.id ?? "");
    setClientMatterRef(quote.client_matter_ref ?? "");
    setInvoiceDate(quote.invoice_date);
    setSubject(quote.subject);
    setVatable(quote.vatable);
    setDiscount(quote.discount);
    setCart(quote.quotation_items ?? []);
    setSelectedClassNumbers([]);
    setClassCount(0);
    setCountryIds([]);
    setProcedureNames([]);
    setError("");
    setModal("form");
  };
  const generateFees = (editingIndex: number | null = null, quantity = 1) => {
    if (!clientId || !countryIds.length || !procedureNames.length) {
      setError(
        "Select a client, at least one country, and at least one procedure.",
      );
      return;
    }
    if (!serviceOptions.some((service) => service.name === category)) {
      setError("Select a valid service from the Services page data.");
      return;
    }
    if (category === "Trademark" && (classCount < 0 || classCount > 45)) {
      setError("Trademark classes must be between 0 and 45.");
      return;
    }
    if (category === "Trademark" && selectedClassNumbers.some((classNumber) =>
      !Number.isInteger(classNumber) || classNumber < 1 || classNumber > 45,
    )) {
      setError("Trademark classes must be whole numbers from 1 to 45.");
      return;
    }
    if (countryIds.some((id) => !lookup.countries.some((country) => country.id === id))) {
      setError("One or more selected countries are no longer available.");
      return;
    }
    if (procedureNames.some((name) => !availableProcedures.some((procedure) => procedure.name === name))) {
      setError("One or more selected procedures do not belong to the selected service.");
      return;
    }
    if (requirementIds.some((id) => !availableRequirements.some((requirement) => requirement.id === id))) {
      setError("One or more selected requirements do not match the selected fee filters.");
      return;
    }
    if (!allExactFeesFound) {
      setError(
        "A fee is not configured for one or more selected country and procedure combinations. Choose procedures with configured fees before adding to the cart.",
      );
      return;
    }
    setError("");
    addGeneratedToCart(editingIndex, quantity);
    return true;
  };
  const addGeneratedToCart = (editingIndex: number | null = null, quantity = 1) => {
    const items = generatedFees.map((fee) => withSnapshot(fee, quantity));
    setCart((current) => editingIndex === null ? [...current, ...items] : [...current.slice(0, editingIndex), ...items, ...current.slice(editingIndex + 1)]);
    if (items[0]) {
      setSubject(
        generateInvoiceSubject({
          item: items[0],
          clientName: client?.company_name ?? "",
          countryName:
            lookup.countries.find((item) => item.id === items[0].country_id)
              ?.name ?? "",
        }),
      );
    }
    setCountryIds([]);
    setProcedureNames([]);
    setRequirementIds([]);
    setSelectedClassNumbers([]);
    setClassCount(0);
    setFeeModal(false);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const invalidCartItem = cart.find((item) => {
      const quantity = Number(item.quantity);
      const classTotal = item.category === "Trademark"
        ? item.class_numbers?.length || item.class_count || 0
        : 0;
      const invalidClassNumber = item.category === "Trademark" &&
        (item.class_numbers ?? []).some((classNumber) =>
          !Number.isInteger(classNumber) || classNumber < 1 || classNumber > 45,
        );
      return !item.country_id || !item.procedure_name || quantity < 1 ||
        (item.category === "Trademark" && (invalidClassNumber || classTotal > 45));
    });
    if (!clientId) {
      setError("Select a client before saving the invoice.");
      return;
    }
    if (!client || !Number.isInteger(Number(client.assigned_id)) || Number(client.assigned_id) < 1) {
      setError("The selected client has no valid Business Identifier.");
      return;
    }
    if (!invoiceDate || Number.isNaN(new Date(invoiceDate).getTime())) {
      setError("Enter a valid invoice date before saving.");
      return;
    }
    if (!cart.length) {
      setError("Add at least one fee to the cart before saving.");
      return;
    }
    if (invalidCartItem) {
      setError("Correct the quantity, country, procedure, or trademark class count in the fee cart.");
      return;
    }
    setSaving(true);
    try {
      const saved = await api<{ id: string; reference_no: string; invoice_verification_token?: string }>(selected ? `quotations/${selected.id}` : "quotations", {
        method: selected ? "PUT" : "POST",
        body: JSON.stringify({
          client_id: clientId,
          project_id: projectId || null,
          client_matter_ref: clientMatterRef,
          invoice_date: invoiceDate,
          subject,
          vatable,
          discount,
          items: cart,
        }),
      });
      if (saved.invoice_verification_token) {
        setVerificationQr(await QRCode.toDataURL(
          `${window.location.origin}/invoice/verify/${saved.invoice_verification_token}`,
          { width: 180, margin: 2, errorCorrectionLevel: "H" },
        ));
      }
      setModal(null);
      setNotice(
        selected
          ? "Quotation updated."
          : "Quotation saved as Pending Approval.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save quotation.",
      );
    } finally {
      setSaving(false);
    }
  };
  const approve = async (quote: Quotation) => {
    setSaving(true);
    try {
      await api(`quotations/${quote.id}/approve`, { method: "POST" });
      setNotice("Quotation approved.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to approve quotation.",
      );
    } finally {
      setSaving(false);
    }
  };
  const cancel = async (quote: Quotation) => {
    try {
      await api(`quotations/${quote.id}/cancel`, { method: "POST" });
      setNotice("Quotation cancelled.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to cancel quotation.");
    }
  };
  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api(`quotations/${selected.id}`, { method: "DELETE" });
      setModal(null);
      setNotice("Quotation deleted.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to delete quotation.",
      );
    } finally {
      setSaving(false);
    }
  };
  const subjectText = generateInvoiceSubject({
    item: {
      ...blankItem(category),
      category,
      procedure_name: procedureNames[0] || "",
    },
    clientName: client?.company_name ?? "",
    countryName: lookup.countries.find((item) => item.id === countryIds[0])?.name ?? "",
  });

  return (
    <main className="procedure-page quotation-page">
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Quotations</b>
          </p>
          <div className="top-profile">
            <span>MS</span>
            <b>
              Mohammad Saleh<small>Administrator</small>
            </b>
          </div>
        </header>
        <div className="countries-heading">
          <div>
            <h1>Quotations</h1>
            <p>Create, review, approve, and manage client quotations.</p>
          </div>
          <button className="country-add" type="button" onClick={openNew} data-action="add" title="Add Quotation"><ActionIcon name="add" /><span className="aipt-action-label">Add Quotation</span></button>
        </div>
        {notice && (
          <div className="country-toast">
            {notice}
            <button type="button" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {error && !modal && <p className="country-page-error">{error}</p>}
        <section className="country-table-card">
          <div className="quotation-toolbar">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search invoice, client, country, procedure..."
            />
            <div className="quotation-status-tabs" role="tablist" aria-label="Quotation status">
              {[["", "All"], ["Pending Approval", "Pending"], ["Approved", "Approved"], ["Cancelled", "Cancelled"]].map(([value, label]) => (
                <button key={value || "all"} type="button" role="tab" aria-selected={status === value} className={`${status === value ? "is-active " : ""}${value ? `is-${value.toLowerCase().replace(/\s+/g, "-")}` : "is-all"}`} onClick={() => { setStatus(value); setPage(1); }}>
                  <i aria-hidden="true" />{label}
                </button>
              ))}
            </div>
            <span>{total} quotations</span>
          </div>
          <div className="country-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Client</th>
                  <th>Client Matter</th>
                  <th>Country</th>
                  <th>Service</th>
                  <th>Procedure</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th><button className="aipt-sort" onClick={()=>{setAscending(!ascending);setPage(1)}}>Date {ascending?"?":"?"}</button></th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="country-state">
                      Loading quotations...
                    </td>
                  </tr>
                ) : rows.length ? (
                  rows.map((quote) => (
                    <tr key={quote.id}>
                      <td>
                        <b>{quote.reference_no}</b>
                      </td>
                      <td>{quote.client?.company_name ?? "-"}</td>
                      <td>
                        {quote.client_matter_ref ||
                          quote.project?.aipt_ref_no ||
                          "-"}
                      </td>
                      <td>
                        {quote.quotation_items
                          ?.map(
                            (item) =>
                              lookup.countries.find(
                                (country) => country.id === item.country_id,
                              )?.name,
                          )
                          .filter(Boolean)
                          .join(", ") ||
                          quote.primary_country?.name ||
                          "-"}
                      </td>
                      <td>
                        {[
                          ...new Set(
                            quote.quotation_items?.map((item) => item.category),
                          ),
                        ].join(", ")}
                      </td>
                      <td>
                        {quote.quotation_items
                          ?.map((item) => item.procedure_name)
                          .join(", ")}
                      </td>
                      <td>${money(quote.grand_total)}</td>
                      <td>
                        <span
                          className={`quotation-status ${quote.status.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {quote.status}
                        </span>
                      </td>
                      <td>{dateText(quote.invoice_date)}</td>
                      <td className="quotation-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(quote);
                            setModal("view");
                          }}
                         data-action="view" data-icon-only="true" title="View"><ActionIcon name="view" /><span className="aipt-action-label">View</span></button>
                        {!isClientRole && <button
                          type="button"
                          onClick={() => openEdit(quote)}
                          disabled={["Approved", "Posted", "Cancelled"].includes(quote.status)}
                         data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button>}
                        {!isClientRole && <button
                          type="button"
                          onClick={() => {
                            setSelected(quote);
                            setModal("delete");
                          }}
                         data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>}
                        {!isClientRole && quote.status === "Pending Approval" && (
                          <button
                            type="button"
                            onClick={() => void approve(quote)}
                            disabled={saving}
                           data-action="approve" data-icon-only="true" title="Approve"><ActionIcon name="approve" /><span className="aipt-action-label">Approve</span></button>
                        )}
                        {!['Approved', 'Posted', 'Cancelled'].includes(quote.status) && (
                          <button type="button" onClick={() => void cancel(quote)} disabled={saving} data-action="cancel" data-icon-only="true" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                        )}                        <button
                          type="button"
                          className="quotation-pdf-action"
                          title={quote.status === "Approved" ? "Open invoice PDF" : "PDF available after approval"}
                          onClick={() => window.open(`/invoice/${quote.id}`, "_blank", "noopener,noreferrer")}
                          disabled={quote.status !== "Approved"}
                         data-action="pdf" data-icon-only="true"><ActionIcon name="pdf" /><span className="aipt-action-label">PDF</span></button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="country-state">
                      No quotations available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} loading={loading} />
        </section>
        {modal === "form" && (
          <InvoiceModal
            client={client}
            clientId={clientId}
            isClientRole={isClientRole}
            setClientId={(value: string) => {
              setClientId(value);
                setProjectId("");
            }}
            projectId={projectId}
            setProjectId={setProjectId}
            clientMatterRef={clientMatterRef}
            setClientMatterRef={setClientMatterRef}
            invoiceDate={invoiceDate}
            setInvoiceDate={setInvoiceDate}
            subject={subject}
            setSubject={setSubject}
            subjectText={subjectText}
            lookup={lookup}
            projects={projects}
            category={category}
            setCategory={(value: Category) => {
              setCategory(value);
              setProcedureNames([]);
            }}
            serviceOptions={serviceOptions}
            availableCategories={availableCategories}
            countryIds={countryIds}
            setCountryIds={setCountryIds}
            procedureNames={procedureNames}
            setProcedureNames={setProcedureNames}
            availableProcedures={availableProcedures}
            requirementIds={requirementIds}
            setRequirementIds={setRequirementIds}
            selectedClassNumbers={selectedClassNumbers}
            setSelectedClassNumbers={(values: number[]) => {
              setSelectedClassNumbers(values);
              setClassCount(values.length);
            }}
            classCount={classCount}
            setClassCount={setClassCount}
            availableRequirements={availableRequirements}
            countries={lookup.countries}
            generateFees={generateFees}
            cart={cart}
            setCart={setCart}
            vatable={vatable}
            setVatable={setVatable}
            discount={discount}
            setDiscount={setDiscount}
            totals={{
              official: officialTotal,
              attorney: attorneyTotal,
              other: otherTotal,
              vat: vatTotal,
              total: grandTotal,
            }}
            countrySummary={countrySummary}
            selected={selected}
            error={error}
            verificationQr={verificationQr}
            saving={saving}
            onClose={() => setModal(null)}
            onSubmit={save}
          />
        )}
        {feeModal && (
          <FeeModal
            fees={generatedFees}
            countries={lookup.countries}
            onAdd={addGeneratedToCart}
            onClose={() => setFeeModal(false)}
          />
        )}
        {modal === "view" && selected && (
          <ViewModal quote={selected} onClose={() => setModal(null)} />
        )}
        {modal === "delete" && selected && (
          <div className="quotation-backdrop">
            <section className="quotation-dialog compact">
              <h2>Delete Quotation</h2>
              <p>Are you sure you want to delete this quotation?</p>
              <div className="modal-actions">
                <button type="button" onClick={() => setModal(null)} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                <button
                  className="danger"
                  type="button"
                  onClick={() => void remove()}
                  disabled={saving}
                 data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function SearchMulti({
  label,
  options,
  selected,
  onChange,
  getId,
  getLabel,
  compact = false,
}: {
  label: string;
  options: Array<{ id?: string; name?: string; description?: string; class_number?: number; flag_url?: string }>;
  selected: string[];
  onChange: (value: string[]) => void;
  getId: (item: { id?: string; name?: string; description?: string; class_number?: number; flag_url?: string }) => string;
  getLabel: (item: {
    id?: string;
    name?: string;
    description?: string;
    class_number?: number;
    flag_url?: string;
  }) => string;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const visible = options.filter((item) =>
    getLabel(item).toLowerCase().includes(query.toLowerCase()),
  );
  const selectedItems = options.filter((item) => selected.includes(getId(item)));
  return (
    <div
      className={`search-multi${compact ? " search-multi-compact" : ""}${compact && (query || focused) ? " has-query" : ""}`}
      onFocus={() => setFocused(true)}
      onBlur={() => window.setTimeout(() => setFocused(false), 150)}
    >
      {label}
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${label.toLowerCase()}`}
      />
      {selectedItems.length > 0 && (
        <div className="selected-chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {selectedItems.map((item) => (
            <span key={getId(item)}>{getLabel(item)}</span>
          ))}
        </div>
      )}
      <div className="search-multi-options">
        {visible.length ? visible.map((item) => {
          const id = getId(item);
          return (
            <label key={id}>
              <input
                type="checkbox"
                checked={selected.includes(id)}
                onChange={() =>
                  onChange(
                    selected.includes(id)
                      ? selected.filter((value: string) => value !== id)
                      : [...selected, id],
                  )
                }
              />
              {validFlagUrl(item.flag_url) ? <img className="search-multi-flag" src={validFlagUrl(item.flag_url)} alt="" /> : null}
              {getLabel(item)}
            </label>
          );
        }) : <span className="search-multi-empty">No matching {label.toLowerCase()} found.</span>}
      </div>
    </div>
  );
}

function RequirementTable({
  countries,
  requirements,
  selected,
  onChange,
}: {
  countries: Country[];
  requirements: Requirement[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="applicable-requirements">
      <div className="requirement-header-row">
        <span className="requirement-toggle">✓</span>
        <div className="requirement-header-copy">
          <span>Requirements</span>
          <small>Auto-filtered based on selected service, country and procedure.</small>
        </div>
      </div>
      <button
        type="button"
        className="applicable-requirements-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="invoice-section-icon">⛭</span>
        <span>Applicable Requirements</span>
        <span className={`chevron${open ? " open" : ""}`}>⌄</span>
      </button>
      {open && (
      <div className="requirement-table-wrapper">
        <table className="requirement-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Country</th>
              <th>Procedure</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {requirements.length ? requirements.map((item) => {
              const country = countries.find((countryItem) => countryItem.id === item.country_id);
              return (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.includes(item.id)}
                      onChange={() => onChange(
                        selected.includes(item.id)
                          ? selected.filter((value) => value !== item.id)
                          : [...selected, item.id],
                      )}
                    />
                  </td>
                  <td>
                    <span className="country-flag-cell">
                      {validFlagUrl(country?.flag_url) ? <img src={validFlagUrl(country?.flag_url)} alt="" /> : null}
                      {country?.name ?? "-"}
                    </span>
                  </td>
                  <td>{item.procedure ?? "-"}</td>
                  <td>{item.description}</td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={4}>No requirements match the selected country and procedure.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function InvoiceModal(props: any) {
  const {
    client,
    clientId,
    isClientRole,
    setClientId,
    projectId,
    setProjectId,
    clientMatterRef,
    setClientMatterRef,
    invoiceDate,
    setInvoiceDate,
    subject,
    setSubject,
    subjectText,
    lookup,
    projects,
    category,
    setCategory,
    availableCategories,
    serviceOptions,
    countryIds,
    setCountryIds,
    procedureNames,
    setProcedureNames,
    availableProcedures,
    requirementIds,
    setRequirementIds,
    selectedClassNumbers,
    setSelectedClassNumbers,
    classCount,
    availableRequirements,
    countries,
    generateFees,
    cart,
    setCart,
    vatable,
    setVatable,
    discount,
    setDiscount,
    totals,
    countrySummary,
    selected,
    error,
    verificationQr,
    saving,
    onClose,
    onSubmit,
  } = props;
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [draftQuantity, setDraftQuantity] = useState("1");
  const validDraft = Number.isInteger(Number(draftQuantity)) && Number(draftQuantity) >= 1 && Number(draftQuantity) <= 1000;
  const cancelEdit = () => {
    setEditingRow(null);
    setCountryIds([]);
    setProcedureNames([]);
    setRequirementIds([]);
    setSelectedClassNumbers([]);
  };
  const beginEdit = (item: QuoteItem, index: number) => {
    setEditingRow(index);
    setDraftQuantity(String(item.quantity || 1));
    setCategory(item.category);
    setCountryIds([item.country_id]);
    setProcedureNames([item.procedure_name]);
    setRequirementIds(item.requirement_ids ?? []);
    setSelectedClassNumbers(item.class_numbers ?? []);
    document.getElementById('quotation-fee-selection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const updateRow = () => {
    if (editingRow === null || !validDraft) return;
    if (generateFees(editingRow, Number(draftQuantity))) setEditingRow(null);
  };
  return (
    <div className="quotation-backdrop">
      <section className="quotation-dialog invoice-dialog">
        <header className="invoice-titlebar">
          <div className="invoice-title-icon">▤</div>
          <div>
            <h2>{selected ? "Edit Client Invoice" : "Create Client Invoice"}</h2>
            <p>Generate a professional invoice for your client</p>
          </div>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <form onSubmit={(event) => { if (editingRow !== null) { event.preventDefault(); return; } onSubmit(event); }}>
          <div className="quotation-section">
            <div className="invoice-section-heading">
              <span className="invoice-section-icon">♙</span>
              <div><h3>Client Details</h3><p>Enter client and contact information.</p></div>
            </div>
            <div className="quotation-grid three">
              <label>
                Client *
                {isClientRole ? (
                  <input value={client?.company_name ?? "Loading company..."} readOnly required />
                ) : (
                  <select
                    value={clientId}
                    onChange={(event) => setClientId(event.target.value)}
                    required
                  >
                    <option value="">Select client</option>
                    {lookup.clients.map((item: Client) => (
                      <option key={item.id} value={item.id}>
                        {item.company_name} ({item.status})
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                  Business Identifier *
                <input
                  value={client ? `${client.assigned_id} (Client ID)` : "Assigned after save"}
                  readOnly
                    required
                />
              </label>
              <label>
                Client Address {client?.address ? "" : "(Not Specified)"}
                <input
                  value={client?.address ?? ""}
                  readOnly
                  placeholder="Address not specified"
                />
              </label>
              <label>
                Date of Invoice *
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                  required
                />
              </label>
              <label>
                Currency *
                <select value="USD" aria-readonly="true" tabIndex={-1} disabled>
                  <option value="USD">USD - US Dollar</option>
                </select>
              </label>
              <label>
                By / Attention
                <input
                  value={clientMatterRef}
                  onChange={(event) => setClientMatterRef(event.target.value)}
                  placeholder="Enter reference and attention details..."
                />
              </label>
            </div>
          </div>
          <div className="quotation-section">
            <div className="invoice-section-heading">
              <span className="invoice-section-icon">⚖</span>
              <div id="quotation-fee-selection"><h3>Fee Selection{editingRow !== null ? " — Edit cart item" : ""}</h3><p>Choose service, country and method to view applicable fees. Requirements will be automatically filtered.</p></div>
            </div>
            <div className="quotation-grid four">
              <div className="fee-field">
                <SearchMulti
                  label={`Services / Project${cart.length ? "" : " *"}`}
                  options={serviceOptions}
                  selected={category ? [category] : []}
                  onChange={(values) => {
                    const selectedService = values.at(-1);
                    if (selectedService) {
                      setCategory(selectedService as Category);
                      setSelectedClassNumbers([]);
                      setProcedureNames([]);
                      setRequirementIds([]);
                    }
                  }}
                  getId={(item) => item.name!}
                  getLabel={(item) => item.name!}
                  compact
                />
                
              </div>
              <SearchMulti
                label={`Country${cart.length ? "" : " *"}`}
                options={lookup.countries}
                selected={countryIds}
                onChange={(values) => { setCountryIds(values); setRequirementIds([]); }}
                getId={(item) => item.id!}
                getLabel={(item) => item.name!}
                compact
              />
              <SearchMulti
                label={`Procedure${cart.length ? "" : " *"} (multiple allowed)`}
                options={availableProcedures}
                selected={procedureNames}
                onChange={(values) => { setProcedureNames(values); setRequirementIds([]); }}
                getId={(item) => item.name!}
                getLabel={(item) => item.name!}
                compact
              />


              {category === "Trademark" && (
                <SearchMulti
                  label="Trademark Classes (optional)"
                  options={Array.from({ length: 45 }, (_, index) => ({ class_number: index + 1 }))}
                  selected={selectedClassNumbers.map(String)}
                  onChange={(values) => setSelectedClassNumbers(values.map(Number).sort((a, b) => a - b))}
                  getId={(item) => String(item.class_number)}
                  getLabel={(item) => `Class ${item.class_number}`}
                  compact
                />
              )}
            </div>
            <div className="selection-panels">
              <RequirementTable countries={countries} requirements={availableRequirements} selected={requirementIds} onChange={setRequirementIds} />
            </div>
            <button
              className="outline-action generate-fees"
              type="button"
              onClick={() => editingRow === null ? generateFees() : updateRow()}
             disabled={editingRow !== null && !validDraft} data-action={editingRow === null ? "add" : "update"} title={editingRow === null ? "Add to cart" : "Update cart item"}><ActionIcon name={editingRow === null ? "add" : "update"} /><span className="aipt-action-label">{editingRow === null ? "Add to cart" : "Update cart item"}</span></button>
            {editingRow !== null && <button type="button" onClick={cancelEdit}>Cancel edit</button>}
          </div>
          <div className="quotation-section">
            <div className="invoice-section-heading">
              <span className="invoice-section-icon">🛒</span>
              <div><h3>Fee Cart</h3><p>Select Edit to modify service, country, procedures and optional classes in Fee Selection. Update applies the configured fees.</p></div>
              <button className="clear-button" type="button" onClick={() => { setCart([]); cancelEdit(); }} data-action="delete" title="Clear Cart"><ActionIcon name="delete" /><span className="aipt-action-label">Clear Cart</span></button>
            </div>
            {cart.length ? (
              <div className="quotation-data-table invoice-cart-table">
                <table>
                  <thead>
                    <tr>
                      <th>Country</th>
                      <th>Procedure</th>
                      <th>Qty</th>
                      <th>No. of Class</th>
                      <th>Official Fee (USD)</th>
                      <th>Attorney Fee (USD)</th>
                      <th>VAT</th>
                      {!isClientRole && <th>Discount (USD)</th>}
                      <th>Total (USD)</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item: QuoteItem, index: number) => {
                      const vat = vatable ? item.attorney_fee * item.vat_rate / 100 : 0;
                      const rowDiscount = !isClientRole && index === 0 ? discount : 0;
                      const claimingPriorityFee = item.claiming_priority_fee ?? 0;
                      const stateFeeTotal = item.state_fee_total ?? 0;
                      const rowTotal = item.official_fee + item.attorney_fee + item.other_fee + claimingPriorityFee + stateFeeTotal + vat - rowDiscount;
                      const country = lookup.countries.find((countryItem: Country) => countryItem.id === item.country_id);
                      return <tr key={`${item.country_id}-${item.procedure_name}-${index}`}>
                        <td><span className="country-flag-cell">{validFlagUrl(country?.flag_url) ? <img src={validFlagUrl(country?.flag_url)} alt="" /> : null}{country?.name ?? "-"}</span></td>
                        <td><strong>{item.procedure_name}</strong>
                        <small>
                          </small>{item.class_numbers?.length ? <small><br />
                            Classes: {item.class_numbers.join(", ")}
                            </small> : null}
                        </td>
                        <td><input className="cart-number" aria-label={`Quantity for ${item.procedure_name}, row ${index + 1}`} type="number" min="1" max="1000" step="1" readOnly={editingRow !== index} value={editingRow === index ? draftQuantity : item.quantity ?? 1} onChange={(event) => setDraftQuantity(event.target.value)} /></td>
                        <td>{(editingRow === index ? category : item.category) === "Trademark" ? (editingRow === index ? selectedClassNumbers.length || 1 : item.class_numbers?.length || 1) : "—"}</td>
                        <td>${money(item.official_fee)}</td>
                        <td>${money(item.attorney_fee)}</td>
                        <td>${money(vat)} <small>({item.vat_rate}%)</small></td>
                        {!isClientRole && <td>${money(rowDiscount)}</td>}
                        <td><strong>${money(rowTotal)}</strong></td>
                        <td><div className="cart-row-actions">{editingRow === index ? <><button type="button" className="cart-update" disabled={!validDraft} onClick={updateRow} data-action="update" data-icon-only="true" title="Update"><ActionIcon name="update" /><span className="aipt-action-label">Update</span></button><button type="button" onClick={cancelEdit} data-action="cancel" data-icon-only="true" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button></> : <button type="button" disabled={editingRow !== null} onClick={() => beginEdit(item, index)} data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button>}<button type="button" className="cart-remove" disabled={editingRow !== null} onClick={() => setCart(cart.filter((_: QuoteItem, itemIndex: number) => itemIndex !== index))} data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button></div></td>
                      </tr>;
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={4}>Total ({cart.length} procedure{cart.length === 1 ? "" : "s"})</th>
                      <th>${money(totals.official)}</th>
                      <th>${money(totals.attorney)}</th>
                      <th>${money(totals.vat)}</th>
                      {!isClientRole && <th>${money(discount)}</th>}
                      <th>${money(totals.total)}</th>
                      <th />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <p className="quotation-help">
                Generate fees and add the exact selected records to the cart.
              </p>
            )}
            {!isClientRole && (
              <div className="quotation-grid four totals">
                <label>
                  Vatable
                  <select
                    value={vatable ? "Yes" : "No"}
                    onChange={(event) => setVatable(event.target.value === "Yes")}
                  >
                    <option>Yes</option>
                    <option>No</option>
                  </select>
                </label>
                  <span className="vat-rate-summary">VAT rates are applied automatically per country.</span>
                <label>
                  Discount
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={(event) => setDiscount(Number(event.target.value))}
                  />
                </label>
                <span>
                  Total<b>${money(totals.total)}</b>
                </span>
              </div>
            )}
            {!isClientRole && (
              <div className="fee-calculation-panel">
                <div className="fee-calculation-header">
                  <span className="invoice-section-icon">ⓘ</span>
                  <div>
                    <h3>Fee Calculation</h3>
                    <p>Calculation per procedure and country.</p>
                  </div>
                </div>
                <div className="fee-calculation-body">
                  {(() => {
                    const example = cart[0];
                    if (!example) return <div className="calc-example">Add fees to the cart to see the calculation breakdown.</div>;
                    const exQty = example.quantity || 1;
                    const exClasses = example.category === "Trademark" ? example.class_numbers?.length || example.class_count || 1 : 1;
                    const exOfficial = example.official_fee / (exQty * exClasses);
                    const exAttorney = example.attorney_fee / (exQty * exClasses);
                    const otherFees = example.other_fee + (example.claiming_priority_fee ?? 0) + (example.state_fee_total ?? 0);
                    const totalFees = example.attorney_fee + example.official_fee + otherFees;
                    const exVat = vatable ? example.attorney_fee * example.vat_rate / 100 : 0;
                    const grand = totalFees + exVat - discount;
                    return (
                      <div className="calc-example">
                        <b>Calculation · {example.procedure_name}</b>
                        <div>Qty ({exQty}) × Classes ({exClasses}) × Attorney Fee ({money(exAttorney)}) = <b>{money(example.attorney_fee)}</b></div>
                        <div>Qty ({exQty}) × Classes ({exClasses}) × Official Fee ({money(exOfficial)}) = <b>{money(example.official_fee)}</b></div>
                        {otherFees > 0 && <div>Other fees and add-ons = <b>{money(otherFees)}</b></div>}
                        <div>Total Fees = <b>{money(totalFees)}</b></div>
                        <div>VAT ({vatable ? example.vat_rate : 0}%) = <b>{money(exVat)}</b></div>
                        {discount > 0 && <div>Discount = <b>{money(discount)}</b></div>}
                        <div>Row Total = <b>{money(grand)}</b></div>
                      </div>
                    );
                  })()}
                  <div className="calc-note-box">
                    <span className="invoice-section-icon">ⓘ</span>
                    <div>
                      <b>Note:</b>
                      <p>VAT is always applied to attorney fees only, not to official fees.</p>
                    </div>
                  </div>
                </div>
                <div className="country-summary-block">
                  <button
                    type="button"
                    className="selection-table-title collapsible-header"
                    onClick={() => setSummaryOpen((value) => !value)}
                  >
                    <span className="invoice-section-icon">▤</span>
                    Country Fee Summary
                    <span className={`chevron${summaryOpen ? " open" : ""}`}>⌄</span>
                  </button>
                  {summaryOpen && <table>
                    <thead>
                      <tr>
                        <th>Country</th>
                        <th>Total Official</th>
                        <th>Total Attorney</th>
                        <th>Total VAT</th>
                        <th>Total Discount</th>
                        <th>Grand Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countrySummary.length ? countrySummary.map((row: {
                        country: string;
                        flag: string;
                        official: number;
                        attorney: number;
                        vat: number;
                        discount: number;
                        total: number;
                      }) => (
                        <tr key={row.country}>
                          <td><span className="country-flag-cell">{validFlagUrl(row.flag) ? <img src={validFlagUrl(row.flag)} alt="" /> : null}{row.country}</span></td>
                          <td>${money(row.official)}</td>
                          <td>${money(row.attorney)}</td>
                          <td>${money(row.vat)}</td>
                          <td>${money(row.discount)}</td>
                          <td><strong>${money(row.total)}</strong></td>
                        </tr>
                      )) : <tr><td colSpan={6}>No country fee summary available.</td></tr>}
                    </tbody>
                  </table>}
                </div>
              </div>
            )}
            <div className="quotation-verification-strip">
              <div><span className="invoice-section-icon">▦</span><div><h3>QR Code for Invoice</h3><p>A QR code will be automatically generated for this invoice / fee cart after the selections are valid.</p></div></div>
              {verificationQr ? (
                <img src={verificationQr} alt="Invoice verification QR code" />
              ) : (
                <span className="qr-ready-pill">✓ QR code will be generated when ready</span>
              )}
            </div>
          </div>
          {error && <p className="quotation-error" role="alert">{error}</p>}
          <footer className="modal-actions">
            <button type="button" onClick={onClose} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
            <button className="primary" type="submit" disabled={saving || editingRow !== null} data-action="update" title="Update Quotation"><ActionIcon name="update" /><span className="aipt-action-label">
              {saving ? "Saving..." : selected ? "Update Quotation" : "Save Quotation"}
            </span></button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function FeeModal({
  fees,
  countries,
  onAdd,
  onClose,
}: {
  fees: Fee[];
  countries: Country[];
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <div className="quotation-backdrop">
      <section className="quotation-dialog compact fee-confirm-dialog">
        <header>
          <h2>Generated Fees</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="fee-confirm-list">
          {fees.map((fee) => (
            <div key={`${fee.country_id}-${fee.procedure_name}`}>
              <b>
                {
                  countries.find((country) => country.id === fee.country_id)
                    ?.name
                }
              </b>
              <span>
                {fee.category} · {fee.procedure_name}
              </span>
              <span>Official Fees: ${money(fee.official_fee)}</span>
              <span>Attorney Fees: ${money(fee.attorney_fee)}</span>
              <strong>Total: ${money(fee.total_fee)}</strong>
            </div>
          ))}
        </div>
        <footer className="modal-actions">
          <button type="button" onClick={onClose} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
          <button className="primary" type="button" onClick={onAdd} data-action="add" title="Add to Cart"><ActionIcon name="add" /><span className="aipt-action-label">Add to Cart</span></button>
        </footer>
      </section>
    </div>
  );
}

function ViewModal({
  quote,
  onClose,
}: {
  quote: Quotation;
  onClose: () => void;
}) {
  return (
    <div className="quotation-backdrop">
      <section className="quotation-dialog compact">
        <header>
          <h2>{quote.reference_no}</h2>
          <button type="button" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="quotation-details">
          <p>
            <b>Client</b>
            {quote.client?.company_name ?? "-"}
          </p>
          <p>
            <b>Address</b>
            {quote.client?.address ?? "-"}
          </p>
          <p>
            <b>Client Matter</b>
            {quote.client_matter_ref || "-"}
          </p>
          <p>
            <b>Invoice Date</b>
            {dateText(quote.invoice_date)}
          </p>
          <p>
            <b>Subject</b>
            {quote.subject || "-"}
          </p>
          <p>
            <b>Status</b>
            {quote.status}
          </p>
          <p>
            <b>Services</b>
            {quote.quotation_items.map((item) => item.category).join(", ")}
          </p>
          <p>
            <b>Procedures</b>
            {quote.quotation_items
              .map((item) => item.procedure_name)
              .join(", ")}
          </p>
          <p>
            <b>Official Fees</b>${money(quote.total_official_fee)}
          </p>
          <p>
            <b>Attorney Fees</b>${money(quote.total_attorney_fee)}
          </p>
          <p>
            <b>VAT</b>${money(quote.total_vat)}
          </p>
          <p>
            <b>Grand Total</b>${money(quote.grand_total)}
          </p>
        </div>
        <footer className="modal-actions">
          <button className="primary" type="button" onClick={onClose} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button>
        </footer>
      </section>
    </div>
  );
}

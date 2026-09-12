"use client";
import ActionIcon from '../../src/components/ActionIcon';

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchSupabaseFunction, getSupabaseBrowserClient } from "../../src/lib/supabase/browser";

type Country = {
  id: string;
  name: string;
  abbreviation: string;
  flag_url: string;
};
type Notification = {
  id: string;
  notification_date: string;
  description: string;
  document_key: string | null;
  document_name: string | null;
  document_size: number | null;
  document_type: string | null;
  countries: Array<{ country: Country }>;
};
type Modal = "add" | "view" | "edit" | "delete" | null;
const pageSize = 10;
const toDateTimeLocal = (value: Date | string = new Date()) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

function CountryFlag({ country }: { country: Country }) {
  const [failed, setFailed] = useState(false);
  return country.flag_url && !failed ? (
    <img className="country-select-flag" src={country.flag_url} alt="" onError={() => setFailed(true)} />
  ) : (
    <span className="country-select-flag country-select-flag-fallback">
      {country.abbreviation.slice(0, 2).toUpperCase()}
    </span>
  );
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]),
    [countries, setCountries] = useState<Country[]>([]),
    [selected, setSelected] = useState<Notification | null>(null),
    [modal, setModal] = useState<Modal>(null);
  const [date, setDate] = useState(""),
    [description, setDescription] = useState(""),
    [countryIds, setCountryIds] = useState<string[]>([]),
    [file, setFile] = useState<File | null>(null),
    [countrySearch, setCountrySearch] = useState(""),
    [countryOpen, setCountryOpen] = useState(false),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [exportOpen, setExportOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const countrySelectRef = useRef<HTMLDivElement>(null);
  const validateDocument = (nextFile: File | null) => {
    if (!nextFile) return true;
    const accepted = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/svg+xml",
    ];
    const extension = nextFile.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "doc", "docx", "xls", "xlsx", "jpg", "jpeg", "png", "svg"].includes(extension) || (nextFile.type && !accepted.includes(nextFile.type))) {
      setError("Choose a PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, or SVG file.");
      return false;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError("The document must be 10MB or smaller.");
      return false;
    }
    setError("");
    setFile(nextFile);
    return true;
  };
  const request = useCallback(
    async (endpoint: string, path = "", options: RequestInit = {}) => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) throw Error("Supabase is not configured.");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw Error("Please sign in.");
      const response = await fetchSupabaseFunction(`${endpoint}${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
          ...options.headers,
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Error(body.error ?? "Request failed.");
      }
      return response.status === 204 ? null : response.json();
    },
    [],
  );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, countryData] = await Promise.all([
        request("notifications"),
        request("countries"),
      ]);
      setItems(data as Notification[]);
      setCountries(countryData as Country[]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, [request]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!countryOpen) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!countrySelectRef.current?.contains(event.target as Node)) {
        setCountryOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCountryOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [countryOpen]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term
      ? items.filter((item) =>
          `${item.description} ${item.document_name ?? ""} ${item.countries.map((value) => value.country.name).join(" ")}`
            .toLowerCase()
            .includes(term),
        )
      : items;
  }, [items, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    current = Math.min(page, pages),
    visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  const open = (kind: Exclude<Modal, null>, item?: Notification) => {
    setSelected(item ?? null);
    setDate(
      item ? toDateTimeLocal(item.notification_date) : toDateTimeLocal(),
    );
    setDescription(item?.description ?? "");
    setCountryIds(item?.countries.map((value) => value.country.id) ?? []);
    setCountrySearch("");
    setCountryOpen(false);
    setFile(null);
    setError("");
    setModal(kind);
  };
  const close = () => !saving && (setModal(null), setError(""));
  const toggleCountry = (countryId: string) => {
    setCountryIds((currentIds) =>
      currentIds.includes(countryId)
        ? currentIds.filter((id) => id !== countryId)
        : [...currentIds, countryId],
    );
  };
  const matchingCountries = countries.filter((country) =>
    `${country.name} ${country.abbreviation}`
      .toLowerCase()
      .includes(countrySearch.trim().toLowerCase()),
  );
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!date) return setError("Choose a notification date.");
    if (description.trim().length < 3)
      return setError("Description must contain at least 3 characters.");
    if (!countryIds.length) return setError("Select at least one country.");
    if (modal === "add" && !file) return setError("Choose a document to upload.");
    setSaving(true);
    setError("");
    try {
      let document = {
        document_key: selected?.document_key ?? null,
        document_name: selected?.document_name ?? null,
        document_size: selected?.document_size ?? null,
        document_type: selected?.document_type ?? null,
      };
      if (file) {
        const supabase = getSupabaseBrowserClient();
        const { data: { session } } = await supabase!.auth.getSession();
        const form = new FormData();
        form.append("file", file);
        const upload = await fetchSupabaseFunction("notifications/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
          body: form,
        });
        const uploaded = await upload.json().catch(() => ({}));
        if (!upload.ok) throw Error(uploaded.error ?? "Document upload to AWS failed.");
        document = {
          document_key: uploaded.key,
          document_name: uploaded.document_name,
          document_size: uploaded.document_size,
          document_type: uploaded.document_type,
        };
      }
      const saved = (await request(
        "notifications",
        modal === "edit" ? `/${selected?.id}` : "",
        {
          method: modal === "edit" ? "PUT" : "POST",
          body: JSON.stringify({
            notification_date: new Date(date).toISOString(),
            description: description.trim(),
            country_ids: countryIds,
            ...document,
          }),
        },
      )) as Notification;
      setItems((currentItems) =>
        modal === "edit"
          ? currentItems.map((item) => (item.id === saved.id ? saved : item))
          : [saved, ...currentItems],
      );
      setNotice(
        modal === "edit"
          ? "Notification updated successfully."
          : "Notification added successfully.",
      );
      setModal(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save notification.",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await request("notifications", `/${selected.id}`, { method: "DELETE" });
      setItems((currentItems) =>
        currentItems.filter((item) => item.id !== selected.id),
      );
      setNotice("Notification deleted successfully.");
      setModal(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete notification.",
      );
    } finally {
      setSaving(false);
    }
  };
  const downloadDocument = async (item: Notification) => {
    try {
      const body = await request("notifications", `/${item.id}/download-url`);
      window.open(body.url, "_blank");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to download document.",
      );
    }
  };
  const exportFile = (content: string, type: string, extension: string) => {
    const url = URL.createObjectURL(new Blob([content], { type })),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `notifications-${new Date().toISOString().slice(0, 10)}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
  };
  const rows = () =>
    filtered.map((item) => [
      item.notification_date,
      item.description,
      item.countries.map((value) => value.country.name).join("; "),
      item.document_name ?? "",
    ]);
  const csv = () =>
    exportFile(
      "\uFEFFDate,Description,Countries,Document\r\n" +
        rows()
          .map((row) =>
            row.map((value) => `"${value.split('"').join('""')}"`).join(","),
          )
          .join("\r\n"),
      "text/csv",
      "csv",
    );
  const word = () =>
    exportFile(
      `<html><body><h1>Notifications</h1><table border="1"><tr><th>Date</th><th>Description</th><th>Countries</th><th>Document</th></tr>${rows()
        .map(
          (row) =>
            `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`,
        )
        .join("")}</table></body></html>`,
      "application/msword",
      "doc",
    );
  const pdf = () => {
    const popup = window.open("", "_blank");
    if (!popup) return setError("Allow pop-ups to export PDF.");
    popup.document.write(
      `<h1>Notifications</h1><table border="1" cellspacing="0" cellpadding="8">${rows()
        .map(
          (row) =>
            `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`,
        )
        .join("")}</table><script>window.onload=()=>window.print()<\/script>`,
    );
    popup.document.close();
    setExportOpen(false);
  };
  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target.files?.[0];
    event.target.value = "";
    if (!input) return;
    setSaving(true);
    try {
      const lines = (await input.text())
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(Boolean);
      const parse = (line: string) =>
        (line.match(/("(?:[^"]|"")*"|[^,]+)(?=,|$)/g) ?? []).map((value) =>
          value.replace(/^"|"$/g, "").split('""').join('"'),
        );
      let count = 0;
      for (const line of lines.slice(1)) {
        const values = parse(line),
          matched = values[2]
            .split(";")
            .map(
              (name) =>
                countries.find(
                  (country) =>
                    country.name.toLowerCase() === name.trim().toLowerCase(),
                )?.id,
            )
            .filter((id): id is string => !!id);
        if (!values[0] || !values[1] || !matched.length) continue;
        await request("notifications", "", {
          method: "POST",
          body: JSON.stringify({
            notification_date: new Date(values[0]).toISOString(),
            description: values[1],
            country_ids: matched,
          }),
        });
        count++;
      }
      await load();
      setNotice(`${count} notifications imported.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="procedure-page notification-page">
      <section>
        <header className="countries-topbar">
          <p>
            Home <i>/</i> <b>Notifications</b>
          </p>
          <div className="top-profile">
            <button>♧</button>
            <span>MS</span>
            <b>
              Mohammad Saleh<small>Administrator</small>
            </b>
          </div>
        </header>
        <div className="countries-heading">
          <div>
            <h1>Notifications</h1>
            <p>View and manage all system notifications.</p>
          </div>
          <div className="procedure-controls">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="⌕ Search..."
            />
            <input
              ref={importRef}
              className="procedure-file-input"
              type="file"
              accept=".csv"
              onChange={importCsv}
            />
            <button
              className="procedure-import"
              onClick={() => importRef.current?.click()}
             data-action="import" title="Import"><ActionIcon name="import" /><span className="aipt-action-label">Import</span></button>
            <div className="procedure-export">
              <button onClick={() => setExportOpen((value) => !value)} data-action="export" title="Export"><ActionIcon name="export" /><span className="aipt-action-label">Export</span></button>
              {exportOpen && (
                <div>
                  <button onClick={csv} data-action="export" title="Excel"><ActionIcon name="export" /><span className="aipt-action-label">Excel</span></button>
                  <button onClick={word} data-action="export" title="Word"><ActionIcon name="export" /><span className="aipt-action-label">Word</span></button>
                  <button onClick={pdf} data-action="pdf" title="PDF"><ActionIcon name="pdf" /><span className="aipt-action-label">PDF</span></button>
                </div>
              )}
            </div>
            <button className="country-add" onClick={() => open("add")} data-action="add" title="Add Notification"><ActionIcon name="add" /><span className="aipt-action-label">Add Notification</span></button>
          </div>
        </div>
        {notice && (
          <div className="country-toast">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}
        <section className="country-table-card">
          {error && !modal && <p className="country-page-error">{error}</p>}
          <div className="country-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Countries</th>
                  <th>Document to Download</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="country-state">
                      Loading notifications…
                    </td>
                  </tr>
                ) : visible.length ? (
                  visible.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <b>
                          {new Date(
                            item.notification_date,
                          ).toLocaleDateString()}
                        </b>
                        <small className="notification-time">
                          {new Date(item.notification_date).toLocaleTimeString(
                            [],
                            { hour: "2-digit", minute: "2-digit" },
                          )}
                        </small>
                      </td>
                      <td>{item.description}</td>
                      <td>
                        {item.countries
                          .map((value) => value.country.name)
                          .join(", ")}
                      </td>
                      <td>
                        <button
                          className="document-link"
                          disabled={!item.document_key}
                          onClick={() => downloadDocument(item)}
                        >
                          ▣ {item.document_name ?? "No document"}
                          <small>
                            {item.document_size
                              ? `${Math.ceil(item.document_size / 1024)} KB`
                              : ""}
                          </small>
                        </button>
                      </td>
                      <td>
                        <button
                          className="country-icon"
                          onClick={() => open("view", item)}
                        >
                          ⊙
                        </button>
                        <button
                          className="country-icon"
                          onClick={() => open("edit", item)}
                         data-action="edit" data-icon-only="true" title="Edit"><ActionIcon name="edit" /><span className="aipt-action-label">Edit</span></button>
                        <button
                          className="country-icon delete"
                          onClick={() => open("delete", item)}
                         data-action="delete" data-icon-only="true" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="country-state">
                      No notifications found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <footer>
            <p>
              Showing {filtered.length ? (current - 1) * pageSize + 1 : 0} to{" "}
              {Math.min(current * pageSize, filtered.length)} of{" "}
              {filtered.length} results
            </p>
            <span className="per-page">
              Per page <b>10</b>
            </span>
            <div>
              <button
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
              >
                ‹
              </button>
              {Array.from({ length: pages }, (_, index) => index + 1).map(
                (value) => (
                  <button
                    key={value}
                    className={value === current ? "current" : ""}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                ),
              )}
              <button
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
              >
                ›
              </button>
            </div>
          </footer>
        </section>
      </section>
      {modal && (
        <div className="country-modal-backdrop" onMouseDown={close}>
          <section
            className="country-modal notification-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {modal === "delete" && selected ? (
              <>
                <header className="country-panel-heading delete-title">
                  <i>♲</i>
                  <div>
                    <h2>Delete Notification</h2>
                    <small>This action cannot be undone.</small>
                  </div>
                  <button onClick={close}>×</button>
                </header>
                <NotificationSummary item={selected} />
                {error && <p className="country-form-error">{error}</p>}
                <footer className="country-panel-footer">
                  <button onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                  <button
                    className="delete-primary"
                    disabled={saving}
                    onClick={remove}
                   data-action="delete" title="Delete"><ActionIcon name="delete" /><span className="aipt-action-label">Delete</span></button>
                </footer>
              </>
            ) : modal === "view" && selected ? (
              <>
                <header className="country-panel-heading">
                  <h2>Notification Details</h2>
                  <button onClick={close}>×</button>
                </header>
                <NotificationSummary item={selected} />
                <footer className="country-panel-footer">
                  <button onClick={close} data-action="cancel" title="Close"><ActionIcon name="cancel" /><span className="aipt-action-label">Close</span></button>
                </footer>
              </>
            ) : (
              <>
                <header className="country-panel-heading">
                  <h2>
                    {modal === "add"
                      ? "Add New Notification"
                      : "Edit Notification"}
                  </h2>
                  <button onClick={close}>×</button>
                </header>
                <form onSubmit={save}>
                  <label className="country-label">
                    <span className="notification-field-label">Date <em>*</em></span>
                    <div className="notification-date-control">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
                      <input
                        type="datetime-local"
                        value={date}
                        onChange={(event) => setDate(event.target.value)}
                        required
                      />
                    </div>
                  </label>
                  <label className="country-label">
                    <span className="notification-field-label">Description <em>*</em></span>
                    <textarea
                      maxLength={500}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Enter notification description..."
                    />
                    <small className="notification-character-count">{description.length}/500</small>
                  </label>
                  <div className="country-label">
                    <span className="notification-field-label">Countries <em>*</em></span>
                    <div className="country-multiselect" ref={countrySelectRef}>
                      <div className="country-search-control">
                        <span aria-hidden="true">⌕</span>
                        <input value={countrySearch} onFocus={() => setCountryOpen(true)} onChange={(event) => { setCountrySearch(event.target.value); setCountryOpen(true); }} placeholder={countryIds.length ? "Search to add another country..." : "Search and select countries..."} />
                        <button type="button" aria-label="Toggle country list" onClick={() => setCountryOpen((open) => !open)}>⌄</button>
                      </div>
                      {countryIds.length > 0 && <div className="country-tags">{countryIds.map((id) => { const country = countries.find((value) => value.id === id); return country ? <button type="button" key={id} onClick={() => toggleCountry(id)}><CountryFlag country={country} /><span>{country.name}</span><i aria-hidden="true">×</i></button> : null; })}</div>}
                      {countryOpen && <div className="country-options">{matchingCountries.length ? matchingCountries.map((country) => <button type="button" className={countryIds.includes(country.id) ? "is-selected" : ""} key={country.id} onClick={() => toggleCountry(country.id)}><CountryFlag country={country} /><span>{country.name}<small>{country.abbreviation}</small></span><i aria-hidden="true">{countryIds.includes(country.id) ? "✓" : ""}</i></button>) : <p>No countries match your search.</p>}</div>}
                    </div>
                    <small>Search and select one or more countries.</small>
                  </div>
                  <label className="country-label">
                    <span className="notification-field-label">Document to Download <em>*</em></span>
                    <input ref={documentRef} className="notification-file-input" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.svg" onChange={(event) => validateDocument(event.target.files?.[0] ?? null)} />
                    <div className="notification-dropzone" role="button" tabIndex={0} onClick={() => documentRef.current?.click()} onKeyDown={(event) => event.key === "Enter" && documentRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); validateDocument(event.dataTransfer.files?.[0] ?? null); }}>
                      <span className="notification-upload-icon">⇧</span>
                      <span><b>{file ? file.name : "Click to upload"}</b>{!file && " or drag and drop"}<small>{file ? `${Math.ceil(file.size / 1024)} KB selected` : "PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, SVG (Max. 10MB)"}</small></span>
                      <button type="button" onClick={(event) => { event.stopPropagation(); documentRef.current?.click(); }}>Browse</button>
                    </div>
                    <small>
                      {file?.name ??
                        selected?.document_name ??
                        "PDF, DOC, DOCX, XLS, XLSX — maximum 10MB"}
                    </small>
                  </label>
                  {error && <p className="country-form-error">{error}</p>}
                  <footer className="country-panel-footer">
                    <button type="button" onClick={close} data-action="cancel" title="Cancel"><ActionIcon name="cancel" /><span className="aipt-action-label">Cancel</span></button>
                    <button disabled={saving} data-action="update" title="Save Notification"><ActionIcon name="update" /><span className="aipt-action-label">
                      {saving
                        ? "Saving…"
                        : modal === "add"
                          ? "Save Notification"
                          : "Update Notification"}
                    </span></button>
                  </footer>
                </form>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
function NotificationSummary({ item }: { item: Notification }) {
  return (
    <div className="country-delete-summary">
      <span>Date</span>
      <b>: {new Date(item.notification_date).toLocaleString()}</b>
      <span>Description</span>
      <b>: {item.description}</b>
      <span>Countries</span>
      <b>: {item.countries.map((value) => value.country.name).join(", ")}</b>
      <span>Document</span>
      <b>: {item.document_name ?? "None"}</b>
    </div>
  );
}

'use client';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
};

export default function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange, loading = false }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  return (
    <footer className="aipt-pagination">
      <span>Showing {total ? (current - 1) * pageSize + 1 : 0}?{Math.min(current * pageSize, total)} of {total}</span>
      <label>Rows per page <select aria-label="Rows per page" value={pageSize} disabled={loading} onChange={event => { onPageSizeChange(Number(event.target.value)); onPageChange(1); }}>
        {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
      <nav aria-label="Table pagination">
        <button type="button" disabled={loading || current <= 1} onClick={() => onPageChange(1)} aria-label="First page">First</button>
        <button type="button" disabled={loading || current <= 1} onClick={() => onPageChange(current - 1)}>Previous</button>
        <span aria-live="polite">Page {current} of {pages}</span>
        <button type="button" disabled={loading || current >= pages} onClick={() => onPageChange(current + 1)}>Next</button>
        <button type="button" disabled={loading || current >= pages} onClick={() => onPageChange(pages)} aria-label="Last page">Last</button>
      </nav>
    </footer>
  );
}

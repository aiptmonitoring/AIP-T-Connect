const previewNavigation = [
  ['grid', 'Overview'],
  ['users', 'Projects'],
  ['users', 'Client'],
  ['globe', 'Countries'],
  ['file', 'Requirements'],
  ['file', 'Procedure'],
  ['briefcase', 'Services'],
  ['tag', 'Classification of Fees'],
  ['bell', 'Notification'],
  ['bell', 'Customer Service'],
  ['bell', 'Statements'],
] as const;

function PreviewIcon({ name }: { name: string }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (name === 'grid') return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === 'users') return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11a3 3 0 0 0 0-6M18 20a5.5 5.5 0 0 0-3-4.9"/></svg>;
  if (name === 'globe') return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
  if (name === 'briefcase') return <svg {...common}><rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5h8v2M3 12h18"/></svg>;
  if (name === 'tag') return <svg {...common}><path d="M20 13l-7 7L3 10V3h7z"/><circle cx="7.5" cy="7.5" r="1"/></svg>;
  if (name === 'bell') return <svg {...common}><path d="M18 8A6 6 0 1 0 6 8c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;
  return <svg {...common}><path d="M7 3h7l4 4v14H7zM14 3v5h5M10 12h5M10 16h5"/></svg>;
}

export function DashboardPreview() {
  const months = ['Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];
  return (
    <aside className="preview auth-dashboard-preview" aria-hidden="true">
      <div className="preview-copy auth-preview-copy">
        <h2>Welcome to Your IP Dashboard</h2>
        <p>Manage projects, track, and monitor your business performance—<br/>all in one place.</p>
      </div>

      <div className="auth-preview-window">
        <nav className="auth-preview-sidebar">
          <div className="auth-preview-brand"><strong>AIP&amp;T</strong><span>INTELLECTUAL PROPERTY</span><b>?</b></div>
          <div className="auth-preview-search"><span>?</span> Search pages...</div>
          <div className="auth-preview-navigation">
            {previewNavigation.map(([icon,label], index) => <div className={index === 0 ? 'active' : ''} key={label}><PreviewIcon name={icon}/><span>{label}</span></div>)}
          </div>
        </nav>

        <section className="auth-preview-content">
          <header className="auth-preview-topbar">
            <div><small>PORTFOLIO INTELLIGENCE</small><h3>Overview</h3><p>Live client-application activity for the selected reporting day.</p></div>
            <div className="auth-preview-reporting"><label>Reporting day<b>08/25/2026 ?</b></label><button>? Refresh</button><button>? Export data</button></div>
          </header>

          <div className="auth-preview-kpis">
            {[['?','Total filed','1','New activity today','violet'],['?','Total accepted','0','No activity yesterday','green'],['?','Total opposition','0','No activity yesterday','red'],['?','Total registered','0','No activity yesterday','blue']].map(([icon,label,value,note,tone]) => <article key={label}><i className={tone}>{icon}</i><span><small>{label}</small><b>{value}</b><em>{note}</em></span></article>)}
          </div>

          <div className="auth-preview-analytics">
            <section className="auth-preview-chart">
              <header><div><h4>Project Performance</h4><p>Lifecycle events grouped by month.</p></div><label>Period<select tabIndex={-1}><option>Last 12 months</option></select></label></header>
              <div className="auth-preview-legend"><span>? Filed</span><span>? Accepted</span><span>? Opposition</span><span>? Registered</span></div>
              <div className="auth-preview-bars">{months.map((month,index)=><i key={month}>{index > 9 && <b style={{height:index === 11 ? 126 : 24}}/>}<span>{month}</span></i>)}</div>
            </section>
            <section className="auth-preview-business">
              <h4>Business Performance</h4><p>Portfolio activity and lifecycle rates for the selected month.</p>
              <div>{[['Active clients','5'],['Active applications','8'],['New this month','8'],['Timeline updates','13'],['Documents saved','13'],['New clients','5']].map(([label,value])=><span key={label}><small>{label}</small><b>{value}</b></span>)}</div>
              <h5>Lifecycle conversion</h5>
              {[['Acceptance rate','71.4%'],['Opposition rate','85.7%'],['Registration rate','28.6%']].map(([label,value],index)=><label key={label}><span>{label}<b>{value}</b></span><i><em style={{width:value,background:['#18a568','#df3d58','#3b73dc'][index]}}/></i><small>{index === 0 ? '5 of 7' : index === 1 ? '6 of 7' : '2 of 7'} filed applications</small></label>)}
            </section>
          </div>

          <section className="auth-preview-recent">
            <header><div><h4>Recent Client Applications</h4><p>Most recently updated applications, including their latest recorded procedure.</p></div><label>Search<input tabIndex={-1} placeholder="Client, project or reference..."/></label><button>View applications ?</button></header>
            <table><thead><tr><th>Application ID</th><th>Client</th><th>Project</th><th>Last Activity</th><th>Status</th></tr></thead><tbody><tr><td>APP-2026-0012</td><td>Tech Innovations Inc.</td><td>AI-Powered Platform</td><td>08/24/2026</td><td><b>Filed</b></td></tr></tbody></table>
          </section>
        </section>
      </div>
    </aside>
  );
}
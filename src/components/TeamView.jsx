import React, { useState, useMemo } from 'react';

const DEPARTMENTS = [
  'All Departments',
  'Account Management',
  'Claims & Operations',
  'Engineering',
  'Customer Success',
  'Onboarding',
  'Finance',
  'Product',
  'Compliance & Legal',
  'Leadership',
];

// ---------------------------------------------------------------------------
// Robust field reader — same as VPView
// ---------------------------------------------------------------------------
function col(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== '') return row[k];
  }
  return '';
}

const getEscId    = r => col(r, 'Escalation ID', 'escalationId');
const getChannel  = r => col(r, 'Source Channel', 'sourceChannel', 'channel', 'Channel');
const getDateTime = r => col(r, 'Date & Time', 'dateTime', 'Date');
const getAccount  = r => col(r, 'Account/Company', 'account', 'Account', 'Company');
const getPriority = r => col(r, 'Priority Label', 'priorityLabel', 'Priority');
const getOwner    = r => col(r, 'Assigned Owner', 'assignedOwner', 'Owner');
const getOwnerDep = r => col(r, 'Owner Department', 'ownerDepartment', 'Department');
const getOwnerEm  = r => col(r, 'Owner Email', 'ownerEmail');
const getSlaHrs   = r => col(r, 'SLA (hrs)', 'slaHrs', 'SLA');
const getSlaDeadl = r => col(r, 'SLA Deadline', 'slaDeadline');
const getStatus   = r => col(r, 'Status', 'status');
const getTat      = r => col(r, 'TAT (hrs)', 'tatHrs', 'TAT');
const getFlags    = r => col(r, 'Flags', 'flags');
const getContext  = r => col(r, 'Subject/Context', 'subjectContext', 'Subject');
const getContent  = r => col(r, 'Full Email Content', 'Full Message Content', 'Full Content', 'fullContent');

function parseDate(str) {
  if (!str) return null;
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const m = str.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (m) return new Date(parseInt(m[3]), months[m[2]], parseInt(m[1]));
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

function slaStatus(row) {
  if (getStatus(row).toLowerCase() === 'closed') return 'closed';
  const deadline = parseDate(getSlaDeadl(row));
  if (!deadline) return 'ok';
  const diffHrs = (deadline - new Date('2026-03-20T10:00:00Z')) / 36e5;
  if (diffHrs < 0)  return 'breached';
  if (diffHrs < 2)  return 'approaching';
  return 'ok';
}

function SlaTrafficLight({ row }) {
  const s = slaStatus(row);
  const map = {
    ok:          { dot:'bg-green-500', text:'text-green-400', label:'Within SLA' },
    approaching: { dot:'bg-yellow-400', text:'text-yellow-400', label:'Approaching' },
    breached:    { dot:'bg-red-500 animate-pulse', text:'text-red-400', label:'Breached' },
    closed:      { dot:'bg-gray-500', text:'text-gray-500', label:'Closed' },
  };
  const m = map[s];
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} />
      <span className={`text-xs ${m.text}`}>{m.label}</span>
    </div>
  );
}

function NudgeIcon({ row }) {
  if (getStatus(row).toLowerCase() === 'closed') return null;
  const created = parseDate(getDateTime(row));
  if (!created) return null;
  const slaHrs = Number(getSlaHrs(row) || 24);
  const ageHrs = (new Date('2026-03-20T10:00:00Z') - created) / 36e5;
  if (ageHrs > slaHrs) {
    return <span title={`Open for ${Math.floor(ageHrs)}h — nudge needed`} className="text-orange-400 text-base">🔔</span>;
  }
  return null;
}

function PriorityBadge({ label }) {
  const cls = { Critical:'badge-critical', High:'badge-high', Medium:'badge-medium', Low:'badge-low' };
  return <span className={cls[label] || 'badge-low'}>{label || 'Low'}</span>;
}

function FlagChips({ flags }) {
  if (!flags) return <span className="text-gray-600 text-xs">—</span>;
  const arr = typeof flags === 'string'
    ? flags.split(',').map(f => f.trim()).filter(Boolean)
    : (Array.isArray(flags) ? flags : []);
  if (!arr.length) return <span className="text-gray-600 text-xs">—</span>;
  const redFlags = ['IRDAI Threat','Legal Threat','Emergency/ICU'];
  return (
    <div className="flex flex-wrap gap-1">
      {arr.map(f => (
        <span key={f} className={redFlags.includes(f) ? 'flag-chip-red' : 'flag-chip-orange'}>{f}</span>
      ))}
    </div>
  );
}

function OwnerCell({ row, employeeMap }) {
  const name = getOwner(row);
  const emp  = employeeMap?.[name];
  const dept = emp?.['Department'] || getOwnerDep(row);
  return (
    <div>
      <p className="text-white font-medium text-xs whitespace-nowrap">{name || 'Unassigned'}</p>
      {dept && <p className="text-gray-400 text-xs mt-0.5">{dept}</p>}
    </div>
  );
}

const STATUS_FLOW = { 'Open':'In Progress', 'In Progress':'Blocked', 'Blocked':'Closed', 'Closed':'Open' };
const STATUS_COLORS = {
  'Open':        'bg-blue-900/40 border-blue-700 text-blue-300 hover:bg-blue-800/50',
  'In Progress': 'bg-yellow-900/40 border-yellow-700 text-yellow-300 hover:bg-yellow-800/50',
  'Blocked':     'bg-red-900/40 border-red-700 text-red-300 hover:bg-red-800/50',
  'Closed':      'bg-green-900/40 border-green-700 text-green-300 hover:bg-green-800/50',
};

const CHANNEL_ICON = { Email:'✉️', Slack:'💬', WhatsApp:'📱' };

// ---------------------------------------------------------------------------
export default function TeamView({ data, onStatusChange, employeeMap = {} }) {
  const [dept,           setDept]           = useState('Account Management');
  const [filterStatus,   setFilterStatus]   = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [search,         setSearch]         = useState('');
  const [expandedId,     setExpandedId]     = useState(null);

  const filtered = useMemo(() => data.filter(r => {
    const ownerDept = getOwnerDep(r);
    return (
      (dept === 'All Departments' || ownerDept === dept) &&
      (filterStatus   === 'All' || getStatus(r)   === filterStatus)   &&
      (filterPriority === 'All' || getPriority(r) === filterPriority) &&
      (!search ||
        getAccount(r).toLowerCase().includes(search.toLowerCase()) ||
        getEscId(r).toLowerCase().includes(search.toLowerCase()))
    );
  }), [data, dept, filterStatus, filterPriority, search]);

  const stats = useMemo(() => ({
    total:    filtered.length,
    open:     filtered.filter(r => getStatus(r) === 'Open').length,
    critical: filtered.filter(r => getPriority(r) === 'Critical').length,
    breached: filtered.filter(r => slaStatus(r) === 'breached').length,
    closed:   filtered.filter(r => getStatus(r).toLowerCase() === 'closed').length,
  }), [filtered]);

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-gray-900 rounded-xl p-4 border border-white/10">
        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <span className="text-xs text-gray-500 block mb-1">Department</span>
            <select className="filter-select text-base font-medium" value={dept} onChange={e => setDept(e.target.value)}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <span className="text-xs text-gray-500 block mb-1">Status</span>
            <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              {['All','Open','In Progress','Blocked','Closed'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <span className="text-xs text-gray-500 block mb-1">Priority</span>
            <select className="filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              {['All','Critical','High','Medium','Low'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <span className="text-xs text-gray-500 block mb-1">Search</span>
            <input
              type="text"
              placeholder="Account or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-violet-500 w-full max-w-xs placeholder-gray-500"
            />
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label:'Total',    val: stats.total,    color:'text-white' },
          { label:'Open',     val: stats.open,     color:'text-blue-400' },
          { label:'Critical', val: stats.critical, color:'text-red-400' },
          { label:'Breached', val: stats.breached, color:'text-orange-400' },
          { label:'Closed',   val: stats.closed,   color:'text-green-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-gray-900 rounded-xl p-3 border border-white/10 text-center">
            <div className={`text-2xl font-bold ${color}`}>{val}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
          <div>
            <span className="font-semibold text-gray-200">{dept}</span>
            <span className="text-xs text-gray-500 ml-2">— {filtered.length} escalation{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <span className="text-xs text-gray-500">Click row to expand · Click status to advance</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 uppercase bg-gray-950/60">
                <th className="px-4 py-3 text-left">ID</th>
                <th className="px-4 py-3 text-left">Ch</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Account</th>
                <th className="px-4 py-3 text-left">Priority</th>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">SLA Deadline</th>
                <th className="px-4 py-3 text-left">SLA Status</th>
                <th className="px-4 py-3 text-left">TAT</th>
                <th className="px-4 py-3 text-left">🔔</th>
                <th className="px-4 py-3 text-left">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((r, idx) => {
                const id = getEscId(r) || `row-${idx}`;
                const priority = getPriority(r);
                const status   = getStatus(r);
                return (
                  <React.Fragment key={id}>
                    <tr
                      className={`transition-colors cursor-pointer ${
                        priority === 'Critical' ? 'table-row-critical border-l-2 border-red-500' :
                        priority === 'High'     ? 'table-row-high border-l-2 border-orange-500' :
                                                  'table-row-default border-l-2 border-transparent'
                      }`}
                      onClick={() => setExpandedId(expandedId === id ? null : id)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-violet-400 whitespace-nowrap">{getEscId(r) || '—'}</td>
                      <td className="px-4 py-3 text-lg" title={getChannel(r)}>{CHANNEL_ICON[getChannel(r)] || '📄'}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {getDateTime(r) ? getDateTime(r).slice(0,10) : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{getAccount(r) || '—'}</td>
                      <td className="px-4 py-3"><PriorityBadge label={priority} /></td>
                      <td className="px-4 py-3"><OwnerCell row={r} employeeMap={employeeMap} /></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); onStatusChange(id, STATUS_FLOW[status] || 'Open'); }}
                          title={`Click to advance → ${STATUS_FLOW[status]}`}
                          className={`text-xs px-2.5 py-0.5 rounded-full border cursor-pointer transition-all whitespace-nowrap
                            ${STATUS_COLORS[status] || STATUS_COLORS['Open']}`}
                          style={{minWidth:'90px', display:'inline-block', textAlign:'center'}}
                        >
                          {status || 'Open'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{getSlaDeadl(r) || '—'}</td>
                      <td className="px-4 py-3"><SlaTrafficLight row={r} /></td>
                      <td className="px-4 py-3 text-xs text-gray-400">{getTat(r) || 0}h</td>
                      <td className="px-4 py-3"><NudgeIcon row={r} /></td>
                      <td className="px-4 py-3"><FlagChips flags={getFlags(r)} /></td>
                    </tr>

                    {expandedId === id && (
                      <tr className="bg-gray-800/60">
                        <td colSpan={12} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs text-gray-400">
                            <div><span className="text-gray-500">Owner:</span> {getOwner(r)}</div>
                            <div><span className="text-gray-500">Owner Email:</span> {getOwnerEm(r)}</div>
                            <div><span className="text-gray-500">Context:</span> {getContext(r)}</div>
                          </div>
                          <div className="bg-gray-900 rounded-lg p-3 text-xs text-gray-300 font-mono whitespace-pre-wrap max-h-40 overflow-y-auto leading-relaxed">
                            {getContent(r) || '(no full content)'}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 items-center">
                            <span className="text-xs text-gray-500">Update status:</span>
                            {['Open','In Progress','Blocked','Closed'].map(s => (
                              <button
                                key={s}
                                onClick={e => { e.stopPropagation(); onStatusChange(id, s); }}
                                className={`btn-status ${status === s
                                  ? 'bg-violet-700 border-violet-500 text-white'
                                  : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'}`}
                              >{s}</button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-gray-600">
                    No escalations for this department with current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

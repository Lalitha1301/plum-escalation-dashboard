import React, { useState, useCallback, useEffect } from 'react';
import { useSheetData } from './hooks/useSheetData';
import VPView   from './components/VPView.jsx';
import TeamView from './components/TeamView.jsx';

export default function App() {
  const [view, setView] = useState('vp');
  const [localStatuses, setLocalStatuses] = useState({});

  const {
    escalations: rawEscalations,
    employees,
    legend,
    loading,
    error,
    lastUpdated,
    refetch,
  } = useSheetData(30000);

  // Debug: log column names on first load
  useEffect(() => {
    if (rawEscalations.length > 0) {
      console.log('=== SHEET DEBUG ===');
      console.log('Total escalation rows:', rawEscalations.length);
      console.log('Escalation columns:', Object.keys(rawEscalations[0]));
      console.log('First escalation row:', rawEscalations[0]);
    }
    if (employees.length > 0) {
      console.log('Employee columns:', Object.keys(employees[0]));
      console.log('First employee:', employees[0]);
    }
  }, [rawEscalations.length, employees.length]);

  // Merge live data with local status overrides
  const escalations = rawEscalations.map(r => {
    const id = r['Escalation ID'] || r.escalationId || '';
    return localStatuses[id] ? { ...r, Status: localStatuses[id], status: localStatuses[id] } : r;
  });

  const onStatusChange = useCallback((id, newStatus) => {
    setLocalStatuses(prev => ({ ...prev, [id]: newStatus }));
  }, []);

  // Employee lookup by Full Name
  const employeeMap = employees.reduce((acc, emp) => {
    const name = emp['Full Name'] || emp['full name'] || emp['Name'] || '';
    if (name) acc[name] = emp;
    return acc;
  }, {});

  // Bucket color lookup from Legend tab
  const bucketColorMap = legend.reduce((acc, row) => {
    const bucket = row['Bucket'] || row['bucket'] || '';
    if (bucket) acc[bucket] = row['Row Colour'] || row['Color'] || '';
    return acc;
  }, {});

  // SLA breach count
  const now = new Date('2026-03-20T10:00:00Z');
  const breachedCount = escalations.filter(r => {
    const status   = r['Status'] || r.status || '';
    const deadline = r['SLA Deadline'] || r.slaDeadline || '';
    if (status.toLowerCase() === 'closed' || !deadline) return false;
    const d = new Date(deadline);
    return !isNaN(d) && d < now;
  }).length;

  // Raw CSV test helper (for debugging)
  const testRawFetch = async () => {
    const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      'https://docs.google.com/spreadsheets/d/1awiEiu-3RfY0oPeE-0QrzDS6n4pWKtikjaf_6bLXeiI/export?format=csv&gid=1978360035'
    )}`;
    const res  = await fetch(url);
    const text = await res.text();
    console.log('RAW CSV (first 800 chars):', text.substring(0, 800));
    console.log('Header row:', text.split('\n')[0]);
    console.log('Row 2:', text.split('\n')[1]);
    alert('Check browser console (F12) for raw CSV headers');
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center gap-4">
          {/* Plum logo */}
          <div style={{
            backgroundColor: '#FF6B6B',
            color: '#FDDCB5',
            fontWeight: 'bold',
            fontSize: '22px',
            padding: '8px 16px',
            borderRadius: '12px',
            letterSpacing: '1px',
            fontFamily: 'sans-serif',
          }}>
            plum
          </div>

          <div className="h-6 w-px bg-white/10" />

          <div className="flex-1">
            <div className="text-sm font-semibold text-white">Escalation Command Center</div>
          </div>

          {/* SLA breach alert */}
          {breachedCount > 0 && (
            <div className="flex items-center gap-2 bg-red-950/60 border border-red-700/60 rounded-lg px-3 py-1.5">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-xs text-red-300 font-medium">{breachedCount} SLA breached</span>
            </div>
          )}

          {/* LIVE dot + timestamp + refresh */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="text-xs text-green-400 font-medium">LIVE</span>
            </div>
            {lastUpdated && (
              <span className="text-xs text-gray-500 hidden md:block">Updated {lastUpdated}</span>
            )}
            <button
              onClick={refetch}
              disabled={loading}
              className="flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
            >
              <span className={loading ? 'animate-spin inline-block' : ''}>🔄</span>
              <span>{loading ? 'Loading...' : 'Refresh'}</span>
            </button>
            {/* Debug button — remove after confirming columns */}
            <button
              onClick={testRawFetch}
              className="text-xs text-gray-600 hover:text-gray-400 px-2 py-1 border border-gray-700 rounded"
              title="Test raw CSV fetch — check console for column names"
            >
              🔍 Debug
            </button>
          </div>
        </div>
      </header>


      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-4 bg-red-950 border border-red-600 text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <span>⚠️</span>
          <div>
            <p className="font-semibold">Could not load live data</p>
            <p className="text-red-400 text-xs mt-1">{error}</p>
            <button onClick={refetch} className="mt-2 text-xs underline text-red-300 hover:text-white">Try again</button>
          </div>
        </div>
      )}

      {/* First load spinner */}
      {loading && escalations.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-500 mx-auto mb-4"></div>
            <p className="text-gray-400">Connecting to Google Sheets...</p>
            <p className="text-gray-600 text-xs mt-1">Loading Escalations · Email · Slack · WhatsApp · Employees</p>
          </div>
        </div>
      )}

      {/* Main content */}
      {(!loading || escalations.length > 0) && (
        <>
          <div className="max-w-screen-2xl mx-auto px-6 pt-5 pb-3 flex items-center gap-1">
            <button
              onClick={() => setView('vp')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${view === 'vp'
                ? 'bg-violet-700 text-white shadow-lg shadow-violet-900/50'
                : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              🎯 VP View
            </button>
            <button
              onClick={() => setView('team')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${view === 'team'
                ? 'bg-violet-700 text-white shadow-lg shadow-violet-900/50'
                : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              👥 Team View
            </button>

            {view === 'vp' && (
              <div className="ml-4 flex gap-4 text-xs text-gray-500">
                <span><span className="inline-block w-2.5 h-0.5 bg-red-500 mr-1 rounded" />Critical rows</span>
                <span><span className="inline-block w-2.5 h-0.5 bg-orange-500 mr-1 rounded" />High rows</span>
                <span>Click row to expand message + update status</span>
              </div>
            )}
            {view === 'team' && (
              <div className="ml-4 text-xs text-gray-500">
                Click status badge to advance workflow · 🔔 = nudge required
              </div>
            )}

            <span className="ml-auto text-xs text-gray-600">
              {escalations.length} rows · Live from Google Sheets
            </span>
          </div>

          <main className="max-w-screen-2xl mx-auto px-6 pb-10">
            {view === 'vp'
              ? <VPView   data={escalations} onStatusChange={onStatusChange} employeeMap={employeeMap} />
              : <TeamView data={escalations} onStatusChange={onStatusChange} employeeMap={employeeMap} />
            }
          </main>
        </>
      )}

      <footer className="border-t border-white/10 mt-10 py-4 text-center text-xs text-gray-600">
        Plum Escalation Command Center · Live via Google Sheets · Built with Claude AI
      </footer>
    </div>
  );
}

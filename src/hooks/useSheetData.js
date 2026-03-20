import { useState, useEffect, useCallback } from 'react';
import { TABS, getSheetURL } from '../config/sheets';
import { parseCSV } from '../utils/parseCSV';

export function useSheetData(refreshInterval = 30000) {
  const [data, setData] = useState({
    escalations: [],
    emails:      [],
    slack:       [],
    whatsapp:    [],
    legend:      [],
    employees:   [],
  });
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [escRes, emailRes, slackRes, waRes, legendRes, empRes] = await Promise.all([
        fetch(getSheetURL(TABS.MASTER_ESCALATIONS)),
        fetch(getSheetURL(TABS.EMAIL)),
        fetch(getSheetURL(TABS.SLACK)),
        fetch(getSheetURL(TABS.WHATSAPP)),
        fetch(getSheetURL(TABS.LEGEND)),
        fetch(getSheetURL(TABS.EMPLOYEES)),
      ]);

      const [escText, emailText, slackText, waText, legendText, empText] = await Promise.all([
        escRes.text(), emailRes.text(), slackRes.text(),
        waRes.text(),  legendRes.text(), empRes.text(),
      ]);

      if (escText.includes('<!DOCTYPE')) {
        throw new Error('Sheet not public — Share → Anyone with link → Viewer');
      }

      const escalations = parseCSV(escText);
      const employees   = parseCSV(empText);

      // Debug — logs to console, harmless in production
      if (escalations.length) {
        console.log('✅ Escalation columns:', Object.keys(escalations[0]));
        console.log('✅ Row 1:', escalations[0]);
        console.log('✅ Total rows:', escalations.length);
      }
      if (employees.length) {
        console.log('✅ Employee columns:', Object.keys(employees[0]));
        console.log('✅ Employees loaded:', employees.length);
      }

      setData({
        escalations,
        emails:    parseCSV(emailText),
        slack:     parseCSV(slackText),
        whatsapp:  parseCSV(waText),
        legend:    parseCSV(legendText),
        employees,
      });

      setLastUpdated(new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }));
    } catch (err) {
      console.error('[useSheetData]', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAll, refreshInterval]);

  return { ...data, loading, error, lastUpdated, refetch: fetchAll };
}

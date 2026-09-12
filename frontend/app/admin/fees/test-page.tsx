'use client';
import ActionIcon from '../../../src/components/ActionIcon';


import { useCallback, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../src/lib/supabase/browser';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message: string;
  duration?: number;
  details?: any;
}

export default function SyncTestPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<string>('');

  const supabase = getSupabaseBrowserClient();

  const addLog = (message: string) => {
    setTestOutput((prev) => prev + message + '\n');
  };

  const runTests = useCallback(async () => {
    setRunning(true);
    setResults([]);
    setTestOutput('');
    addLog('🧪 Starting Sync API Tests...\n');

    const testList: TestResult[] = [];

    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) {
        addLog('❌ Not authenticated. Please log in first.\n');
        setResults([{ name: 'Authentication', status: 'error', message: 'No active session' }]);
        setRunning(false);
        return;
      }

      addLog(`✓ Authenticated as: ${session.user.email}\n\n`);

      // Test 1: Check Sync Progress Endpoint
      addLog('Test 1: GET /sync-progress\n');
      const startTime1 = Date.now();
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-progress`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );

        const duration = Date.now() - startTime1;
        const data = await response.json();

        if (response.ok) {
          addLog(`  ✓ Status: ${response.status}\n`);
          addLog(`  ✓ Duration: ${duration}ms\n`);
          addLog(`  ✓ Current Status: ${data.status}\n`);
          addLog(`  ✓ Response size: ${JSON.stringify(data).length} bytes\n\n`);

          testList.push({
            name: 'GET /sync-progress',
            status: 'success',
            message: 'Endpoint responding correctly',
            duration,
            details: data,
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${data.error_message}`);
        }
      } catch (error) {
        const duration = Date.now() - startTime1;
        addLog(`  ✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
        testList.push({
          name: 'GET /sync-progress',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
        });
      }

      // Test 2: Fees API Endpoint
      addLog('Test 2: GET /fees-api (Trademark)\n');
      const startTime2 = Date.now();
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fees-api?category=Trademark&limit=10`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );

        const duration = Date.now() - startTime2;
        const data = await response.json();

        if (response.ok) {
          addLog(`  ✓ Status: ${response.status}\n`);
          addLog(`  ✓ Duration: ${duration}ms\n`);
          addLog(`  ✓ Records returned: ${data.records?.length || 0}\n`);
          addLog(`  ✓ Has next page: ${!!data.next_cursor}\n\n`);

          testList.push({
            name: 'GET /fees-api',
            status: 'success',
            message: 'Successfully fetched fees data',
            duration,
            details: { recordCount: data.records?.length, hasNextPage: !!data.next_cursor },
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${data.error}`);
        }
      } catch (error) {
        const duration = Date.now() - startTime2;
        addLog(`  ✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
        testList.push({
          name: 'GET /fees-api',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
        });
      }

      // Test 3: Sync Start (dry-run check only)
      addLog('Test 3: POST /sync-progress (status check)\n');
      const startTime3 = Date.now();
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-progress`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'status' }),
          }
        );

        const duration = Date.now() - startTime3;
        const data = await response.json();

        if (response.ok) {
          addLog(`  ✓ Status: ${response.status}\n`);
          addLog(`  ✓ Duration: ${duration}ms\n`);
          addLog(`  ✓ Sync Status: ${data.status}\n`);
          addLog(`  ✓ Can start sync: ${data.status === 'idle'}\n\n`);

          testList.push({
            name: 'POST /sync-progress (status)',
            status: 'success',
            message: 'Sync endpoint responding',
            duration,
            details: { syncStatus: data.status },
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${data.error_message}`);
        }
      } catch (error) {
        const duration = Date.now() - startTime3;
        addLog(`  ✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
        testList.push({
          name: 'POST /sync-progress (status)',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
        });
      }

      // Test 4: Fees Sheet Data
      addLog('Test 4: GET /fees (sheet data)\n');
      const startTime4 = Date.now();
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/fees`,
          { headers: { Authorization: `Bearer ${session.access_token}` } }
        );

        const duration = Date.now() - startTime4;
        const data = await response.json();

        if (response.ok) {
          addLog(`  ✓ Status: ${response.status}\n`);
          addLog(`  ✓ Duration: ${duration}ms\n`);
          addLog(`  ✓ Sheet: ${data.spreadsheet?.title}\n`);
          addLog(`  ✓ Total rows: ${data.rows?.length}\n`);
          addLog(`  ✓ Procedure groups: ${data.procedure_groups?.length}\n\n`);

          testList.push({
            name: 'GET /fees',
            status: 'success',
            message: 'Sheet data retrieved successfully',
            duration,
            details: {
              sheet: data.spreadsheet?.title,
              rowCount: data.rows?.length,
              procedureGroups: data.procedure_groups?.length,
            },
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${data.error}`);
        }
      } catch (error) {
        const duration = Date.now() - startTime4;
        addLog(`  ✗ Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n`);
        testList.push({
          name: 'GET /fees',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration,
        });
      }

      addLog('✅ All tests completed!\n');
    } catch (error) {
      addLog(`\n❌ Test suite failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
    }

    setResults(testList);
    setRunning(false);
  }, [supabase]);

  const getStatusIcon = (status: TestResult['status']): string => {
    const icons = {
      pending: '⏳',
      running: '🔄',
      success: '✓',
      error: '✗',
    };
    return icons[status];
  };

  const getStatusClass = (status: TestResult['status']): string => {
    const classes = {
      pending: 'pending',
      running: 'running',
      success: 'success',
      error: 'error',
    };
    return classes[status];
  };

  return (
    <div className="sync-test-page">
      {/* Header */}
      <div className="test-header">
        <h1>🧪 Sync API Test Suite</h1>
        <p>Test all sync-related API endpoints</p>
      </div>

      {/* Controls */}
      <div className="test-controls">
        <button
          className="btn btn-primary"
          onClick={runTests}
          disabled={running}
        >
          {running ? '⏳ Running Tests...' : '▶ Run Tests'}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setResults([]);
            setTestOutput('');
          }}
          disabled={running}
         data-action="delete" title="Clear Results"><ActionIcon name="delete" /><span className="aipt-action-label">Clear Results</span></button>
      </div>

      <div className="test-content">
        {/* Test Results */}
        <div className="test-results">
          <h2>Test Results</h2>
          {results.length === 0 ? (
            <p className="empty-state">
              {running ? 'Running tests...' : 'Click "Run Tests" to start'}
            </p>
          ) : (
            <div className="results-list">
              {results.map((result, index) => (
                <div key={index} className={`result-item ${getStatusClass(result.status)}`}>
                  <div className="result-icon">{getStatusIcon(result.status)}</div>
                  <div className="result-content">
                    <h3>{result.name}</h3>
                    <p>{result.message}</p>
                    {result.duration && (
                      <small className="duration">⏱ {result.duration}ms</small>
                    )}
                  </div>
                  {result.details && (
                    <div className="result-details">
                      <details>
                        <summary>Details</summary>
                        <pre>{JSON.stringify(result.details, null, 2)}</pre>
                      </details>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Test Output Log */}
        <div className="test-output">
          <h2>Output Log</h2>
          <pre className="output-log">
            {testOutput || 'No output yet. Run tests to see detailed logs.'}
          </pre>
        </div>
      </div>

      {/* Info Box */}
      <div className="test-info">
        <h3>📋 Tests Included</h3>
        <ul>
          <li><strong>GET /sync-progress:</strong> Check current sync status and progress</li>
          <li><strong>GET /fees-api:</strong> Fetch paginated fees data with cursor pagination</li>
          <li><strong>POST /sync-progress:</strong> Check if sync can be started</li>
          <li><strong>GET /fees:</strong> Retrieve raw sheet data with procedure groups</li>
        </ul>
      </div>
    </div>
  );
}

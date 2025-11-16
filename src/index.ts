import { Client } from "pg";

interface Env {
  HYPERDRIVE: Hyperdrive;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API endpoint to get train cars data
    if (url.pathname === "/api/train-cars") {
      return await getTrainCars(env, ctx, url.searchParams);
    }

    // Serve the HTML frontend for all other routes
    return new Response(getHTML(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  },
};

async function getTrainCars(env: Env, ctx: ExecutionContext, searchParams: URLSearchParams): Promise<Response> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });

  try {
    await client.connect();

    // Build query with optional filters
    const search = searchParams.get("search") || "";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    let query = "SELECT vehicle_id, name, status, delivery_date, enter_service_date, batch_id, notes FROM train_cars";
    let countQuery = "SELECT COUNT(*) as total FROM train_cars";
    const lastUpdatedQuery = "SELECT last_autoanalyze FROM pg_stat_user_tables WHERE relname = 'train_cars'";
    const params: any[] = [];

    if (search) {
      const whereClause = " WHERE " +
        "LPAD(CAST(vehicle_id AS TEXT), 3, '0') ILIKE $1 OR " +
        "CAST(vehicle_id AS TEXT) ILIKE $1 OR " +
        "name ILIKE $1 OR " +
        "CAST(status AS TEXT) ILIKE $1 OR " +
        "delivery_date ILIKE $1 OR " +
        "enter_service_date ILIKE $1 OR " +
        "notes ILIKE $1";

      query += whereClause;
      countQuery += whereClause;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY vehicle_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;

    // Execute queries
    const [dataResult, countResult, lastUpdatedResult] = await Promise.all([
      client.query(query, [...params, limit, offset]),
      client.query(countQuery, params.length > 0 ? params : []),
      client.query(lastUpdatedQuery),
    ]);

    // Close the connection after response is returned
    ctx.waitUntil(client.end());

    return Response.json({
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
      lastUpdated: lastUpdatedResult.rows[0]?.last_autoanalyze || null,
    });
  } catch (e) {
    ctx.waitUntil(client.end());
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OMCzero Vehicle Database</title>

  <!-- Primary Meta Tags -->
  <meta name="title" content="SkyTrain Vehicle Database">
  <meta name="description" content="Browse and search the complete SkyTrain vehicle database. Maintained by OMCzero volunteers with detailed information on all SkyTrain cars.">

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://traindb.omczero.com/">
  <meta property="og:title" content="SkyTrain Vehicle Database">
  <meta property="og:description" content="Browse and search the complete SkyTrain vehicle database. Maintained by OMCzero volunteers with detailed information on all SkyTrain cars.">
  <meta property="og:site_name" content="OMCzero">

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="https://traindb.omczero.com/">
  <meta property="twitter:title" content="SkyTrain Vehicle Database">
  <meta property="twitter:description" content="Browse and search the complete SkyTrain vehicle database. Maintained by OMCzero volunteers with detailed information on all SkyTrain cars.">

  <!-- Additional Meta Tags -->
  <meta name="theme-color" content="#2c3e50">
  <meta name="author" content="OMCzero">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: white;
      min-height: 100vh;
      padding: 0;
      margin: 0;
    }

    .container {
      width: 100%;
      margin: 0;
      background: white;
      overflow: hidden;
    }

    header {
      background: #2c3e50;
      color: white;
      padding: 20px 30px;
      text-align: center;
    }

    header h1 {
      font-size: 1.8rem;
      margin-bottom: 8px;
      font-weight: 700;
    }

    header p {
      opacity: 0.85;
      font-size: 0.9rem;
      line-height: 1.4;
    }

    .controls {
      padding: 25px 30px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
      align-items: center;
    }

    .search-box {
      flex: 1;
      min-width: 250px;
      position: relative;
    }

    .search-box input {
      width: 100%;
      padding: 12px 40px 12px 15px;
      border: 2px solid #dee2e6;
      border-radius: 8px;
      font-size: 1rem;
      transition: all 0.3s;
    }

    .search-box input:focus {
      outline: none;
      border-color: #3498db;
      box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
    }

    .search-icon {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #6c757d;
    }

    .btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s;
      white-space: nowrap;
    }

    .btn-primary {
      background: #3498db;
      color: white;
    }

    .btn-primary:hover {
      background: #2980b9;
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(52, 152, 219, 0.4);
    }

    .btn-primary:disabled {
      background: #95a5a6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .stats {
      padding: 20px 30px;
      background: #f8f9fa;
      border-bottom: 1px solid #e9ecef;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
    }

    .stats-info {
      color: #495057;
      font-size: 0.95rem;
    }

    .last-updated {
      color: #6c757d;
      font-size: 0.85rem;
      margin-top: 5px;
    }

    .pagination {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .table-container {
      overflow-x: auto;
      padding: 30px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
    }

    thead {
      background: #2c3e50;
      color: white;
    }

    th {
      padding: 15px;
      text-align: left;
      font-weight: 600;
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    td {
      padding: 15px;
      border-bottom: 1px solid #e9ecef;
      color: #495057;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Specific column widths */
    th:nth-child(1), td:nth-child(1) { /* vehicle_id */
      width: 100px;
      white-space: nowrap;
    }

    th:nth-child(2), td:nth-child(2) { /* name */
      min-width: 200px;
      max-width: 300px;
      white-space: nowrap;
    }

    th:nth-child(3), td:nth-child(3) { /* status */
      width: 130px;
      white-space: nowrap;
    }

    th:nth-child(4), td:nth-child(4) { /* delivery_date */
      width: 120px;
      white-space: nowrap;
    }

    th:nth-child(5), td:nth-child(5) { /* enter_service_date */
      width: 140px;
      white-space: nowrap;
    }

    th:nth-child(6), td:nth-child(6) { /* batch_id */
      width: 100px;
      white-space: nowrap;
    }

    th:nth-child(7), td:nth-child(7) { /* notes */
      min-width: 200px;
      max-width: 400px;
      white-space: normal;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    tbody tr {
      transition: all 0.2s;
    }

    tbody tr:hover {
      background: #f8f9fa;
    }

    .status-badge {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      white-space: nowrap;
    }

    .status-in-service {
      background: #d4edda;
      color: #155724;
    }

    .status-in-testing {
      background: #d1ecf1;
      color: #0c5460;
    }

    .status-retired {
      background: #e2e3e5;
      color: #383d41;
    }

    .status-scrapped {
      background: #f8d7da;
      color: #721c24;
    }

    .status-sold {
      background: #fff3cd;
      color: #856404;
    }

    .status-unknown {
      background: #f8f9fa;
      color: #6c757d;
    }

    .loading {
      text-align: center;
      padding: 60px;
      color: #6c757d;
      font-size: 1.2rem;
    }

    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 20px auto;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error {
      background: #f8d7da;
      color: #721c24;
      padding: 20px;
      margin: 30px;
      border-radius: 8px;
      border: 1px solid #f5c6cb;
    }

    .empty-state {
      text-align: center;
      padding: 60px 30px;
      color: #6c757d;
    }

    .empty-state svg {
      width: 100px;
      height: 100px;
      margin-bottom: 20px;
      opacity: 0.5;
    }

    /* Modal styles */
    .modal {
      display: none;
      position: fixed;
      z-index: 1000;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      animation: fadeIn 0.2s;
    }

    .modal.active {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      padding: 25px;
      max-width: 500px;
      width: 100%;
      max-height: 80vh;
      overflow-y: auto;
      animation: slideUp 0.3s;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #e9ecef;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.3rem;
      color: #2c3e50;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 1.8rem;
      cursor: pointer;
      color: #6c757d;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.2s;
    }

    .modal-close:hover {
      background: #f8f9fa;
      color: #2c3e50;
    }

    .modal-field {
      margin-bottom: 15px;
    }

    .modal-field-label {
      font-weight: 600;
      color: #6c757d;
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }

    .modal-field-value {
      color: #2c3e50;
      font-size: 1rem;
    }

    .mobile-hint {
      display: none;
      font-size: 0.85rem;
      color: #6c757d;
      font-style: italic;
      margin-top: 5px;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 768px) {
      header h1 {
        font-size: 1.5rem;
      }

      header p {
        font-size: 0.8rem;
      }

      .controls {
        flex-direction: column;
        padding: 15px;
      }

      .search-box {
        width: 100%;
      }

      .btn {
        width: 100%;
      }

      .stats {
        flex-direction: column;
        align-items: flex-start;
        padding: 15px;
      }

      .pagination {
        width: 100%;
        justify-content: space-between;
        margin-top: 10px;
      }

      .table-container {
        padding: 15px;
        overflow-x: auto;
      }

      table {
        font-size: 0.8rem;
        min-width: 100%;
      }

      th, td {
        padding: 8px;
      }

      /* Make rows tappable on mobile */
      tbody tr {
        cursor: pointer;
      }

      tbody tr:active {
        background: #e9ecef;
      }

      /* Show mobile hint */
      .mobile-hint {
        display: block;
      }

      /* Hide some columns on mobile for better layout */
      th:nth-child(4), td:nth-child(4), /* delivery_date */
      th:nth-child(5), td:nth-child(5), /* enter_service_date */
      th:nth-child(6), td:nth-child(6) { /* batch_id */
        display: none;
      }

      th:nth-child(7), td:nth-child(7) { /* notes */
        max-width: 150px;
      }

      /* Shorten column headers on mobile */
      th:nth-child(1) {
        font-size: 0;
        line-height: 0;
      }
      th:nth-child(1)::after {
        content: 'ID';
        font-size: 0.95rem;
        line-height: normal;
      }

      /* Hide page info on mobile */
      #pageInfo {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>SkyTrain Vehicle Database</h1>
      <p>Maintained by OMCzero volunteers. This database may contain inaccurate information. Use this at your own risk.</p>
    </header>

    <div class="controls">
      <div class="search-box">
        <input
          type="text"
          id="searchInput"
          placeholder="Search by vehicle ID, name, status, dates, or notes..."
        >
        <span class="search-icon">🔍</span>
      </div>
      <button class="btn btn-primary" onclick="loadData()">Search</button>
      <button class="btn btn-primary" onclick="clearSearch()">Clear</button>
    </div>

    <div class="stats" id="stats" style="display: none;">
      <div>
        <div class="stats-info" id="statsInfo"></div>
        <div class="last-updated" id="lastUpdated"></div>
        <div class="mobile-hint">Tap any row to view full details</div>
      </div>
      <div class="pagination">
        <button class="btn btn-primary" id="prevBtn" onclick="prevPage()">← Previous</button>
        <span id="pageInfo"></span>
        <button class="btn btn-primary" id="nextBtn" onclick="nextPage()">Next →</button>
      </div>
    </div>

    <div class="table-container">
      <div id="content">
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading train cars data...</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Modal for mobile view -->
  <div id="modal" class="modal" onclick="closeModal(event)">
    <div class="modal-content" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h2 id="modalTitle">Train Car Details</h2>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div id="modalBody"></div>
    </div>
  </div>

  <script>
    let currentPage = 0;
    const pageSize = 50;
    let totalRecords = 0;
    let currentSearch = '';
    let currentData = [];
    let lastUpdated = null;

    async function loadData(page = 0) {
      currentPage = page;
      const searchTerm = document.getElementById('searchInput').value;
      currentSearch = searchTerm;

      const offset = page * pageSize;
      const url = \`/api/train-cars?limit=\${pageSize}&offset=\${offset}&search=\${encodeURIComponent(searchTerm)}\`;

      document.getElementById('content').innerHTML = \`
        <div class="loading">
          <div class="spinner"></div>
          <p>Loading train cars data...</p>
        </div>
      \`;

      try {
        const response = await fetch(url);
        const json = await response.json();

        if (!response.ok) {
          throw new Error(json.error || 'Failed to fetch data');
        }

        totalRecords = json.total;
        lastUpdated = json.lastUpdated;
        displayData(json.data);
        updateStats();
      } catch (error) {
        document.getElementById('content').innerHTML = \`
          <div class="error">
            <strong>Error:</strong> \${error.message}
          </div>
        \`;
      }
    }

    function displayData(data) {
      currentData = data;

      if (data.length === 0) {
        document.getElementById('content').innerHTML = \`
          <div class="empty-state">
            <h2>No train cars found</h2>
            <p>Try adjusting your search criteria</p>
          </div>
        \`;
        return;
      }

      const columns = Object.keys(data[0]);

      const columnLabels = {
        vehicle_id: 'VEHICLE ID',
        name: 'NAME',
        status: 'STATUS',
        delivery_date: 'DELIVERY DATE',
        enter_service_date: 'ENTERED SERVICE',
        batch_id: 'BATCH ID',
        notes: 'NOTES'
      };

      let html = '<table><thead><tr>';
      columns.forEach(col => {
        const label = columnLabels[col] || col.replace(/_/g, ' ').toUpperCase();
        html += \`<th>\${label}</th>\`;
      });
      html += '</tr></thead><tbody>';

      data.forEach((row, index) => {
        html += \`<tr onclick="openModal(\${index})">\`;
        columns.forEach(col => {
          let value = row[col];

          // Format vehicle_id with leading zeros
          if (col === 'vehicle_id' && value !== null && value !== undefined) {
            value = String(value).padStart(3, '0');
          }

          // Format status with badge
          if (col === 'status' && value) {
            const statusClass = \`status-\${value.toLowerCase().replace(/\\s+/g, '-')}\`;
            value = \`<span class="status-badge \${statusClass}">\${value}</span>\`;
          }

          // Handle null values
          if (value === null || value === undefined) {
            value = '<em style="color: #adb5bd;">N/A</em>';
          }

          html += \`<td>\${value}</td>\`;
        });
        html += '</tr>';
      });

      html += '</tbody></table>';
      document.getElementById('content').innerHTML = html;
    }

    function updateStats() {
      const start = currentPage * pageSize + 1;
      const end = Math.min((currentPage + 1) * pageSize, totalRecords);
      const totalPages = Math.ceil(totalRecords / pageSize);

      document.getElementById('stats').style.display = 'flex';
      document.getElementById('statsInfo').textContent =
        \`Showing \${start} to \${end} of \${totalRecords} train cars\${currentSearch ? \` (filtered)\` : ''}\`;
      document.getElementById('pageInfo').textContent =
        \`Page \${currentPage + 1} of \${totalPages || 1}\`;

      // Format and display last updated date
      if (lastUpdated) {
        const date = new Date(lastUpdated);
        const options = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(date);
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        const year = parts.find(p => p.type === 'year').value;

        // Add ordinal suffix to day
        const ordinal = (day) => {
          const s = ['th', 'st', 'nd', 'rd'];
          const v = day % 100;
          return day + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        document.getElementById('lastUpdated').textContent =
          \`Database last updated \${month} \${ordinal(day)}, \${year}\`;
      }

      document.getElementById('prevBtn').disabled = currentPage === 0;
      document.getElementById('nextBtn').disabled = end >= totalRecords;
    }

    function prevPage() {
      if (currentPage > 0) {
        loadData(currentPage - 1);
      }
    }

    function nextPage() {
      if ((currentPage + 1) * pageSize < totalRecords) {
        loadData(currentPage + 1);
      }
    }

    function clearSearch() {
      document.getElementById('searchInput').value = '';
      loadData(0);
    }

    // Modal functions
    function openModal(index) {
      const row = currentData[index];
      if (!row) return;

      const modal = document.getElementById('modal');
      const modalBody = document.getElementById('modalBody');
      const modalTitle = document.getElementById('modalTitle');

      modalTitle.textContent = row.name || 'Train Car Details';

      const fieldLabels = {
        vehicle_id: 'Vehicle ID',
        name: 'Name',
        status: 'Status',
        delivery_date: 'Delivery Date',
        enter_service_date: 'Entered Service',
        batch_id: 'Batch ID',
        notes: 'Notes'
      };

      let html = '';
      Object.keys(row).forEach(key => {
        let value = row[key];

        // Format vehicle_id with leading zeros
        if (key === 'vehicle_id' && value !== null && value !== undefined) {
          value = String(value).padStart(3, '0');
        }

        // Format status with badge
        if (key === 'status' && value) {
          const statusClass = \`status-\${value.toLowerCase().replace(/\\s+/g, '-')}\`;
          value = \`<span class="status-badge \${statusClass}">\${value}</span>\`;
        }

        // Handle null values
        if (value === null || value === undefined) {
          value = '<em style="color: #adb5bd;">N/A</em>';
        }

        html += \`
          <div class="modal-field">
            <div class="modal-field-label">\${fieldLabels[key] || key}</div>
            <div class="modal-field-value">\${value}</div>
          </div>
        \`;
      });

      modalBody.innerHTML = html;
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeModal(event) {
      if (event && event.target !== document.getElementById('modal')) {
        return;
      }
      const modal = document.getElementById('modal');
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Load initial data
    loadData();

    // Enable Enter key for search
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        loadData(0);
      }
    });
  </script>
</body>
</html>`;
}

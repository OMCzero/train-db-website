import { Client } from "pg";

interface Env {
  HYPERDRIVE: Hyperdrive;
}

// Helper function to add security headers to responses
function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API endpoint to get train cars data
    if (url.pathname === "/api/train-cars") {
      // Validate that the request comes from our own domain
      const origin = request.headers.get("Origin");
      const referer = request.headers.get("Referer");
      const host = request.headers.get("Host") || url.host;

      // If Origin or Referer is present, it must be from our domain
      const hasInvalidOrigin = origin && origin !== `https://${host}` && origin !== `http://${host}`;
      const hasInvalidReferer = referer && !referer.startsWith(`https://${host}/`) && !referer.startsWith(`http://${host}/`);

      if (hasInvalidOrigin || hasInvalidReferer) {
        const response = Response.json(
          { error: "Unauthorized: API can only be called from this website." },
          { status: 403 }
        );
        return addSecurityHeaders(response);
      }

      const response = await getTrainCars(env, ctx, url.searchParams);
      return addSecurityHeaders(response);
    }

    // Serve the HTML frontend for all other routes
    const response = new Response(getHTML(), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
    return addSecurityHeaders(response);
  },
};

async function getTrainCars(env: Env, ctx: ExecutionContext, searchParams: URLSearchParams): Promise<Response> {
  const client = new Client({ connectionString: env.HYPERDRIVE.connectionString });

  try {
    await client.connect();

    // Build query with optional filters
    const search = searchParams.get("search") || "";
    const groupByMarriage = searchParams.get("groupByMarriage") === "true";
    // Validate and constrain limit and offset parameters
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50"), 1), 100);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

    let query = `SELECT
      tc.vehicle_id,
      tc.name,
      tc.status,
      tc.delivery_date,
      tc.enter_service_date,
      tc.batch_id,
      tc.notes,
      tm.common_name as model_common_name,
      tm.manufacturer,
      tm.manufacture_location,
      tm.years_manufactured,
      tm.full_name
    FROM train_cars tc
    LEFT JOIN train_models tm ON tc.batch_id = tm.batch_id`;
    let countQuery = "SELECT COUNT(*) as total FROM train_cars tc";
    const lastUpdatedQuery = "SELECT MAX(last_modified) as last_modified FROM train_cars";
    const params: any[] = [];

    // When grouping by marriage, fetch ALL data and ignore search at DB level
    // Frontend will filter marriages based on search
    if (!groupByMarriage && search) {
      const whereClause = " WHERE " +
        "LPAD(CAST(tc.vehicle_id AS TEXT), 3, '0') ILIKE $1 OR " +
        "CAST(tc.vehicle_id AS TEXT) ILIKE $1 OR " +
        "tc.name ILIKE $1 OR " +
        "CAST(tc.status AS TEXT) ILIKE $1 OR " +
        "tc.delivery_date ILIKE $1 OR " +
        "tc.enter_service_date ILIKE $1 OR " +
        "tc.notes ILIKE $1 OR " +
        "tm.common_name ILIKE $1";

      query += whereClause;
      countQuery += " LEFT JOIN train_models tm ON tc.batch_id = tm.batch_id" + whereClause;
      params.push(`%${search}%`);
    }

    // When grouping by marriage, fetch ALL data (no pagination at DB level)
    // Frontend will handle pagination of marriage groups
    if (groupByMarriage) {
      query += ` ORDER BY tc.vehicle_id`;
    } else {
      query += ` ORDER BY tc.vehicle_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    }

    // Fetch marriages data if grouping is enabled
    let marriagesPromise = Promise.resolve(null);
    if (groupByMarriage) {
      marriagesPromise = client.query("SELECT marriage_id, batch_id, cars, marriage_size FROM car_marriages ORDER BY marriage_id");
    }

    // Execute queries
    const queryParams = groupByMarriage ? params : [...params, limit, offset];
    const [dataResult, countResult, lastUpdatedResult, marriagesResult] = await Promise.all([
      client.query(query, queryParams),
      client.query(countQuery, params.length > 0 ? params : []),
      client.query(lastUpdatedQuery),
      marriagesPromise,
    ]);

    // Close the connection after response is returned
    ctx.waitUntil(client.end());

    return Response.json({
      data: dataResult.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
      lastUpdated: lastUpdatedResult.rows[0]?.last_modified || null,
      marriages: marriagesResult?.rows || null,
    });
  } catch (e) {
    ctx.waitUntil(client.end());
    // Log detailed error for debugging (available in Cloudflare dashboard)
    console.error("Database error:", e);
    // Return generic error message to client to prevent information disclosure
    return Response.json(
      { error: "An error occurred while fetching train cars data. Please try again later." },
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

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 1rem;
      color: #495057;
      user-select: none;
    }

    .checkbox-label input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
    }

    .checkbox-label span {
      white-space: nowrap;
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
      overflow: visible;
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

    /* Specific column widths using data attributes */
    th[data-column="vehicle_id"], td[data-column="vehicle_id"] {
      width: 100px;
      white-space: nowrap;
      overflow: visible;
      position: relative;
    }

    th[data-column="model_common_name"], td[data-column="model_common_name"] {
      width: 150px;
      white-space: nowrap;
    }

    th[data-column="name"], td[data-column="name"] {
      min-width: 200px;
      max-width: 300px;
      white-space: nowrap;
    }

    th[data-column="status"], td[data-column="status"] {
      width: 130px;
      white-space: nowrap;
    }

    th[data-column="delivery_date"], td[data-column="delivery_date"] {
      width: 120px;
      white-space: nowrap;
    }

    th[data-column="enter_service_date"], td[data-column="enter_service_date"] {
      width: 140px;
      white-space: nowrap;
    }

    th[data-column="notes"], td[data-column="notes"] {
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

    .marriage-row {
      background: #e3f2fd !important;
      font-weight: 600;
      cursor: pointer;
    }

    .marriage-row:hover {
      background: #bbdefb !important;
    }

    .marriage-row td {
      padding: 15px;
    }

    .marriage-expand-icon {
      display: inline-block;
      margin-right: 8px;
      transition: transform 0.2s;
    }

    .marriage-row.expanded .marriage-expand-icon {
      transform: rotate(90deg);
    }

    .car-row {
      background: #fafafa;
    }

    .car-row td:first-child {
      padding-left: 40px;
    }

    .car-row.hidden {
      display: none;
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

    .modal-section {
      margin-bottom: 25px;
    }

    .modal-section:last-child {
      margin-bottom: 0;
    }

    .modal-section-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #2c3e50;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e9ecef;
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

    .desktop-hint {
      display: block;
      font-size: 0.85rem;
      color: #6c757d;
      font-style: italic;
      margin-top: 5px;
    }

    /* Tooltip styles */
    .info-tooltip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .info-icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #3498db;
      color: white;
      font-size: 12px;
      font-weight: bold;
      text-align: center;
      line-height: 16px;
      cursor: help;
      position: relative;
    }

    .info-icon::before {
      content: 'i';
      font-style: normal;
    }

    .info-icon .tooltip-text {
      display: none;
      width: 300px;
      background-color: #2c3e50;
      color: white;
      text-align: left;
      padding: 12px;
      border-radius: 8px;
      position: fixed;
      z-index: 1001;
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 0.85rem;
      line-height: 1.4;
      font-weight: normal;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      word-wrap: break-word;
      white-space: normal;
      overflow-wrap: break-word;
    }

    .info-icon .tooltip-text.visible {
      display: block;
      opacity: 1;
    }

    .info-icon .tooltip-text::after {
      content: "";
      position: absolute;
      top: 50%;
      right: 100%;
      margin-top: -5px;
      border-width: 5px;
      border-style: solid;
      border-color: transparent #2c3e50 transparent transparent;
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

      /* Show mobile hint, hide desktop hint */
      .mobile-hint {
        display: block;
      }

      .desktop-hint {
        display: none;
      }

      /* Hide some columns on mobile for better layout */
      th[data-column="delivery_date"], td[data-column="delivery_date"],
      th[data-column="enter_service_date"], td[data-column="enter_service_date"] {
        display: none;
      }

      th[data-column="notes"], td[data-column="notes"] {
        max-width: 150px;
      }

      /* Shorten column headers on mobile */
      th[data-column="vehicle_id"] {
        font-size: 0;
        line-height: 0;
      }
      th[data-column="vehicle_id"]::after {
        content: 'ID';
        font-size: 0.95rem;
        line-height: normal;
      }

      /* Hide page info on mobile */
      #pageInfo {
        display: none;
      }

      /* Reduce tooltip width on mobile */
      .info-icon .tooltip-text {
        width: 240px;
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
      <label class="checkbox-label">
        <input type="checkbox" id="groupByMarriage" onchange="loadData(0)">
        <span>Group by marriage</span>
      </label>
      <button class="btn btn-primary" onclick="loadData()">Search</button>
      <button class="btn btn-primary" onclick="clearSearch()">Clear</button>
    </div>

    <div class="stats" id="stats" style="display: none;">
      <div>
        <div class="stats-info" id="statsInfo"></div>
        <div class="last-updated" id="lastUpdated"></div>
        <div class="mobile-hint">Tap any row to view full details</div>
        <div class="desktop-hint">Click any row to view full details</div>
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
    let marriages = null;
    let filteredMarriagesCount = 0;

    async function loadData(page = 0) {
      currentPage = page;
      const searchTerm = document.getElementById('searchInput').value;
      const groupByMarriage = document.getElementById('groupByMarriage').checked;
      currentSearch = searchTerm;

      const offset = page * pageSize;
      const url = \`/api/train-cars?limit=\${pageSize}&offset=\${offset}&search=\${encodeURIComponent(searchTerm)}&groupByMarriage=\${groupByMarriage}\`;

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
        marriages = json.marriages;
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

      const groupByMarriage = document.getElementById('groupByMarriage').checked;

      // Define which columns to show in the table
      const tableColumns = ['vehicle_id', 'model_common_name', 'name', 'status', 'delivery_date', 'enter_service_date', 'notes'];

      const columnLabels = {
        vehicle_id: 'VEHICLE ID',
        model_common_name: 'MODEL',
        name: 'NAME',
        status: 'STATUS',
        delivery_date: 'DELIVERY DATE',
        enter_service_date: 'ENTERED SERVICE',
        notes: 'NOTES'
      };

      let html = '<table><thead><tr>';
      tableColumns.forEach(col => {
        const label = columnLabels[col] || col.replace(/_/g, ' ').toUpperCase();
        html += \`<th data-column="\${col}">\${label}</th>\`;
      });
      html += '</tr></thead><tbody>';

      if (groupByMarriage && marriages) {
        // Group data by marriage
        const vehicleMap = {};
        data.forEach((row, index) => {
          vehicleMap[row.vehicle_id] = { row, index };
        });

        // Track which vehicles have been displayed
        const displayedVehicles = new Set();

        // Filter marriages based on search
        const searchTerm = currentSearch.toLowerCase();
        const availableMarriages = marriages.filter(marriage => {
          // If no search, show all marriages
          if (!searchTerm) return true;

          // Check if any car in the marriage matches the search
          return marriage.cars.some(carId => {
            const car = vehicleMap[carId]?.row;
            if (!car) return false;

            // Search across various fields
            const vehicleIdMatch = String(carId).padStart(3, '0').includes(searchTerm) ||
                                  String(carId).includes(searchTerm);
            const nameMatch = car.name?.toLowerCase().includes(searchTerm);
            const statusMatch = car.status?.toLowerCase().includes(searchTerm);
            const deliveryMatch = car.delivery_date?.toLowerCase().includes(searchTerm);
            const serviceMatch = car.enter_service_date?.toLowerCase().includes(searchTerm);
            const notesMatch = car.notes?.toLowerCase().includes(searchTerm);
            const modelMatch = car.model_common_name?.toLowerCase().includes(searchTerm);

            return vehicleIdMatch || nameMatch || statusMatch || deliveryMatch ||
                   serviceMatch || notesMatch || modelMatch;
          });
        });

        // Store filtered count for stats
        filteredMarriagesCount = availableMarriages.length;

        // Paginate marriages (not individual cars)
        const start = currentPage * pageSize;
        const end = start + pageSize;
        const paginatedMarriages = availableMarriages.slice(start, end);

        // Display marriages
        paginatedMarriages.forEach((marriage, displayIndex) => {
          const marriageIndex = marriages.indexOf(marriage);
          // Show ALL cars in the marriage, not just the ones that match search
          const carsInMarriage = marriage.cars;

          if (carsInMarriage.length > 0) {
            // Create marriage header row with common fields
            // Use the first car that matches the search for field values
            const firstMatchingCar = carsInMarriage.find(carId => vehicleMap[carId]);
            if (!firstMatchingCar) return; // Skip if no matching cars (shouldn't happen)

            const firstCar = vehicleMap[firstMatchingCar].row;
            const carIds = carsInMarriage.map(id => {
              const isMarkV = id >= 6000 && id < 7000;
              return String(id).padStart(isMarkV ? 4 : 3, '0');
            }).join(', ');

            // Check if any car in the marriage has notes
            const hasNotes = carsInMarriage.some(carId => {
              const car = vehicleMap[carId]?.row;
              return car && car.notes && car.notes.trim() !== '';
            });

            html += \`<tr class="marriage-row" onclick="toggleMarriage(\${marriageIndex})">\`;

            // Add cells for each column
            tableColumns.forEach(col => {
              let value = '';

              if (col === 'vehicle_id') {
                // Show the marriage cars list
                value = \`<span class="marriage-expand-icon">▶</span>\${carIds}\`;
              } else if (col === 'model_common_name') {
                // Show model
                value = firstCar.model_common_name;
              } else if (col === 'name') {
                // Show marriage info instead of name
                value = \`Marriage \${marriage.marriage_id} (\${marriage.marriage_size} cars)\`;
              } else if (col === 'status') {
                // Show status with badge
                value = firstCar.status;
                if (value) {
                  const statusClass = \`status-\${value.toLowerCase().replace(/\\s+/g, '-')}\`;
                  value = \`<span class="status-badge \${statusClass}">\${value}</span>\`;
                }
              } else if (col === 'delivery_date') {
                value = firstCar.delivery_date;
              } else if (col === 'enter_service_date') {
                value = firstCar.enter_service_date;
              } else if (col === 'notes') {
                // Show indicator if any car has notes
                if (hasNotes) {
                  value = '<em style="color: #666; font-style: italic;">See individual cars</em>';
                } else {
                  value = '';
                }
              }

              // Handle null values
              if (value === null || value === undefined || value === '') {
                value = '<em style="color: #adb5bd;">N/A</em>';
              }

              html += \`<td data-column="\${col}">\${value}</td>\`;
            });

            html += '</tr>';

            // Add individual car rows (initially hidden)
            carsInMarriage.forEach(carId => {
              const { row, index } = vehicleMap[carId];
              displayedVehicles.add(carId);
              html += \`<tr class="car-row hidden" data-marriage="\${marriageIndex}" onclick="openModal(\${index})">\`;

              tableColumns.forEach(col => {
                let value = row[col];

                // Format vehicle_id with leading zeros and add tooltip for Mark V (4-digit 6xxx series)
                if (col === 'vehicle_id' && value !== null && value !== undefined) {
                  const isMarkV = value >= 6000 && value < 7000;
                  const formattedId = String(value).padStart(isMarkV ? 4 : 3, '0');
                  if (isMarkV) {
                    value = \`<span class="info-tooltip">\${formattedId}<span class="info-icon" data-train-id="\${formattedId}"><span class="tooltip-text"></span></span></span>\`;
                  } else {
                    value = formattedId;
                  }
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

                html += \`<td data-column="\${col}">\${value}</td>\`;
              });
              html += '</tr>';
            });
          }
        });
      } else {
        // Normal display without grouping
        data.forEach((row, index) => {
          html += \`<tr onclick="openModal(\${index})">\`;
          tableColumns.forEach(col => {
            let value = row[col];

            // Format vehicle_id with leading zeros and add tooltip for Mark V (4-digit 6xxx series)
            if (col === 'vehicle_id' && value !== null && value !== undefined) {
              const isMarkV = value >= 6000 && value < 7000;
              const formattedId = String(value).padStart(isMarkV ? 4 : 3, '0');
              if (isMarkV) {
                value = \`<span class="info-tooltip">\${formattedId}<span class="info-icon" data-train-id="\${formattedId}"><span class="tooltip-text"></span></span></span>\`;
              } else {
                value = formattedId;
              }
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

            html += \`<td data-column="\${col}">\${value}</td>\`;
          });
          html += '</tr>';
        });
      }

      html += '</tbody></table>';
      document.getElementById('content').innerHTML = html;
    }

    function updateStats() {
      const groupByMarriage = document.getElementById('groupByMarriage').checked;

      let start, end, totalPages, totalItems;

      if (groupByMarriage && marriages) {
        // Count marriages (not individual cars)
        // Use filtered count if searching
        totalItems = currentSearch ? filteredMarriagesCount : marriages.length;
        totalPages = Math.ceil(totalItems / pageSize);
        start = currentPage * pageSize + 1;
        end = Math.min((currentPage + 1) * pageSize, totalItems);
      } else {
        // Count individual cars
        totalItems = totalRecords;
        totalPages = Math.ceil(totalItems / pageSize);
        start = currentPage * pageSize + 1;
        end = Math.min((currentPage + 1) * pageSize, totalItems);
      }

      document.getElementById('stats').style.display = 'flex';

      if (currentSearch) {
        const itemType = groupByMarriage ? 'marriages' : 'train cars';
        document.getElementById('statsInfo').textContent =
          \`Showing \${totalItems} \${itemType} (filtered)\`;
      } else {
        const itemType = groupByMarriage ? 'marriages' : 'train cars';
        document.getElementById('statsInfo').textContent =
          \`Showing \${start} to \${end} of \${totalItems} \${itemType}\`;
      }

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
      document.getElementById('nextBtn').disabled = end >= totalItems;
    }

    function prevPage() {
      if (currentPage > 0) {
        loadData(currentPage - 1);
      }
    }

    function nextPage() {
      const groupByMarriage = document.getElementById('groupByMarriage').checked;
      const totalItems = groupByMarriage && marriages ? marriages.length : totalRecords;

      if ((currentPage + 1) * pageSize < totalItems) {
        loadData(currentPage + 1);
      }
    }

    function clearSearch() {
      document.getElementById('searchInput').value = '';
      loadData(0);
    }

    function toggleMarriage(marriageIndex) {
      const marriageRows = document.querySelectorAll(\`tr.car-row[data-marriage="\${marriageIndex}"]\`);
      const marriageRow = document.querySelectorAll('.marriage-row')[marriageIndex];

      marriageRows.forEach(row => {
        row.classList.toggle('hidden');
      });

      if (marriageRow) {
        marriageRow.classList.toggle('expanded');
      }
    }

    // Modal functions
    function openModal(index) {
      const row = currentData[index];
      if (!row) return;

      const modal = document.getElementById('modal');
      const modalBody = document.getElementById('modalBody');
      const modalTitle = document.getElementById('modalTitle');

      modalTitle.textContent = row.name || 'Train Car Details';

      const carFields = [
        'vehicle_id',
        'name',
        'status',
        'delivery_date',
        'enter_service_date',
        'notes'
      ];

      const modelFields = [
        'model_common_name',
        'full_name',
        'manufacturer',
        'manufacture_location',
        'years_manufactured'
      ];

      const fieldLabels = {
        vehicle_id: 'Vehicle ID',
        name: 'Name',
        status: 'Status',
        delivery_date: 'Delivery Date',
        enter_service_date: 'Entered Service',
        notes: 'Notes',
        model_common_name: 'Model',
        full_name: 'Full Model Name',
        manufacturer: 'Manufacturer',
        manufacture_location: 'Manufacture Location',
        years_manufactured: 'Years Manufactured'
      };

      let html = '<div class="modal-section"><h3 class="modal-section-title">Vehicle Details</h3>';

      carFields.forEach(key => {
        if (!(key in row)) return;

        let value = row[key];

        // Format vehicle_id with leading zeros and add tooltip for Mark V (4-digit 6xxx series)
        if (key === 'vehicle_id' && value !== null && value !== undefined) {
          // Mark V trains (6xxx) are 4-digit, all others are 3-digit
          const isMarkV = value >= 6000 && value < 7000;
          const formattedId = String(value).padStart(isMarkV ? 4 : 3, '0');
          if (isMarkV) {
            value = \`<span class="info-tooltip">\${formattedId}<span class="info-icon" data-train-id="\${formattedId}"><span class="tooltip-text"></span></span></span>\`;
          } else {
            value = formattedId;
          }
        }

        // Format status with badge
        if (key === 'status' && value) {
          const statusClass = \`status-\${value.toLowerCase().replace(/\\s+/g, '-')}\`;
          value = \`<span class="status-badge \${statusClass}">\${value}</span>\`;
        }

        // Handle null values
        if (value === null || value === undefined) {
          value = '<em style="color: #adb5bd;">N/A</em>';
        } else if (key === 'notes') {
          // Convert newlines to <br> tags for multi-line notes
          value = String(value).replace(/\\n/g, '<br>');
        }

        html += \`
          <div class="modal-field">
            <div class="modal-field-label">\${fieldLabels[key] || key}</div>
            <div class="modal-field-value">\${value}</div>
          </div>
        \`;
      });

      html += '</div><div class="modal-section"><h3 class="modal-section-title">Model Information</h3>';

      modelFields.forEach(key => {
        if (!(key in row)) return;

        let value = row[key];

        // Handle null values
        if (value === null || value === undefined) {
          value = '<em style="color: #adb5bd;">N/A</em>';
        } else if (key === 'manufacture_location' || key === 'notes') {
          // Convert newlines to <br> tags for multi-line fields
          value = String(value).replace(/\\n/g, '<br>');
        }

        html += \`
          <div class="modal-field">
            <div class="modal-field-label">\${fieldLabels[key] || key}</div>
            <div class="modal-field-value">\${value}</div>
          </div>
        \`;
      });

      html += '</div>';

      modalBody.innerHTML = html;
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Reset scroll position after the DOM updates
      // Use requestAnimationFrame to ensure it happens after render
      requestAnimationFrame(() => {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
          modalContent.scrollTop = 0;
        }
        modalBody.scrollTop = 0;
      });
    }

    function closeModal(event) {
      if (event && event.target !== document.getElementById('modal')) {
        return;
      }
      const modal = document.getElementById('modal');
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Generate tooltip text for Mark V trains
    function getMarkVTooltipText(trainId) {
      const trainNum = parseInt(trainId);

      // Get the 3-digit VCC pair numbers (e.g., 6012 -> 601, 6022 -> 602)
      const vccPairNum = Math.floor(trainNum / 10);

      // Determine if this is odd or even in the VCC pair
      const isEven = vccPairNum % 2 === 0;

      // Calculate the VCC pair (e.g., 601/602 or 603/604)
      const vccOdd = isEven ? vccPairNum - 1 : vccPairNum;
      const vccEven = isEven ? vccPairNum : vccPairNum + 1;

      // Generate the actual 4-digit car numbers based on the VCC pair digits
      // For pair 601/602: 6011, 6022, 6023, 6024, 6025
      // For pair 603/604: 6031, 6042, 6043, 6044, 6045
      const vehicle1 = \`\${vccOdd}1\`;
      const vehicle2 = \`\${vccEven}2\`;
      const vehicle3 = \`\${vccEven}3\`;
      const vehicle4 = \`\${vccEven}4\`;
      const vehicle5 = \`\${vccEven}5\`;

      return \`Mark V trains have 5 cars with 4-digit IDs, but vehicle control computers (VCCs) treat them as 2-car pairs using 3-digit identifiers. Train \${trainId} is part of VCC pair \${vccOdd}/\${vccEven} and has cars \${vehicle1}, \${vehicle2}, \${vehicle3}, \${vehicle4}, and \${vehicle5}.\`;
    }

    // Tooltip positioning
    function positionTooltip(iconElement, tooltipElement) {
      const iconRect = iconElement.getBoundingClientRect();
      const isMobile = window.innerWidth <= 768;
      const tooltipWidth = isMobile ? 240 : 300;
      const spacing = 10;

      // Set tooltip text based on train ID
      const trainId = iconElement.getAttribute('data-train-id');
      if (trainId) {
        tooltipElement.textContent = getMarkVTooltipText(trainId);
      }

      // Make tooltip visible temporarily to get its height
      tooltipElement.style.display = 'block';
      const tooltipHeight = tooltipElement.offsetHeight;

      // Check if we're inside a modal
      const isInModal = iconElement.closest('.modal');

      // Position to the right of the icon by default
      let left = iconRect.right + spacing;
      let top = iconRect.top + (iconRect.height / 2) - (tooltipHeight / 2);

      // If in modal, always show on the right (don't flip to left)
      // Otherwise, flip to left if it would go off the right edge
      if (!isInModal && left + tooltipWidth > window.innerWidth) {
        left = iconRect.left - tooltipWidth - spacing;
      }

      // Make sure tooltip doesn't go off the top
      if (top < spacing) {
        top = spacing;
      }

      // Make sure tooltip doesn't go off the bottom
      if (top + tooltipHeight > window.innerHeight - spacing) {
        top = window.innerHeight - tooltipHeight - spacing;
      }

      tooltipElement.style.left = left + 'px';
      tooltipElement.style.top = top + 'px';
      tooltipElement.classList.add('visible');
    }

    // Track if we're using touch (mobile) or mouse (desktop)
    let isTouchDevice = false;

    // Detect touch device
    document.addEventListener('touchstart', function() {
      isTouchDevice = true;
    }, { once: true });

    // Set up tooltip positioning on hover (desktop only)
    document.addEventListener('mouseover', (e) => {
      if (isTouchDevice) return; // Skip on touch devices
      if (e.target.classList.contains('info-icon')) {
        const tooltip = e.target.querySelector('.tooltip-text');
        if (tooltip) {
          positionTooltip(e.target, tooltip);
        }
      }
    });

    // Hide tooltip on mouseout (desktop only)
    document.addEventListener('mouseout', (e) => {
      if (isTouchDevice) return; // Skip on touch devices
      if (e.target.classList.contains('info-icon')) {
        const tooltip = e.target.querySelector('.tooltip-text');
        if (tooltip) {
          tooltip.classList.remove('visible');
        }
      }
    });

    // Handle clicks on info icon
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('info-icon') || e.target.closest('.info-icon')) {
        e.stopPropagation();
        e.preventDefault();

        // On mobile, toggle tooltip
        const icon = e.target.classList.contains('info-icon') ? e.target : e.target.closest('.info-icon');
        const tooltip = icon.querySelector('.tooltip-text');
        if (tooltip && isTouchDevice) {
          if (tooltip.classList.contains('visible')) {
            tooltip.classList.remove('visible');
          } else {
            positionTooltip(icon, tooltip);
          }
        }
      }
    }, true);

    // Close tooltip when clicking outside (mobile)
    document.addEventListener('click', (e) => {
      if (isTouchDevice && !e.target.classList.contains('info-icon') && !e.target.closest('.info-icon')) {
        const visibleTooltips = document.querySelectorAll('.tooltip-text.visible');
        visibleTooltips.forEach(tooltip => tooltip.classList.remove('visible'));
      }
    });

    // Hide tooltips when scrolling
    let scrollTimeout;
    document.addEventListener('scroll', (e) => {
      // Hide all visible tooltips immediately when scrolling
      const visibleTooltips = document.querySelectorAll('.tooltip-text.visible');
      visibleTooltips.forEach(tooltip => tooltip.classList.remove('visible'));
    }, true);

    // Load initial data
    loadData();

    // Enable Enter key for search
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadData(0);
        // Blur the input to dismiss the keyboard on mobile only
        if (isTouchDevice) {
          e.target.blur();
        }
      }
    });
  </script>
</body>
</html>`;
}

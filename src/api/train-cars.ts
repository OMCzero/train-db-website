import { Client } from "pg";
import type { Env, TrainCarsResponse } from "../types";

export async function getTrainCars(
  env: Env,
  ctx: ExecutionContext,
  searchParams: URLSearchParams
): Promise<Response> {
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
    } as TrainCarsResponse);
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

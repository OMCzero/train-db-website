# Train Cars Database Viewer

A responsive web application built with Cloudflare Workers and Hyperdrive to display and search train cars data from a PostgreSQL database.

## Features

- **Real-time Database Access**: Connects to PostgreSQL via Cloudflare Hyperdrive for low-latency queries
- **Responsive Design**: Beautiful, mobile-friendly interface that works on all devices
- **Full-Text Search**: Search across all fields including vehicle ID, name, status, model, and notes
- **Model Information**: Displays train model details from the train_models table
- **Pagination**: Navigate through large datasets efficiently (50 records per page)
- **Status Badges**: Color-coded status indicators (In Service, In Testing, Retired, etc.)
- **Interactive Details**: Click any row to view complete vehicle and model information
- **Error Handling**: Graceful error messages and loading states

## Architecture

- **Frontend**: Single-page HTML with vanilla JavaScript
- **Backend**: Cloudflare Worker (TypeScript)
- **Database**: PostgreSQL accessed via Hyperdrive
- **Connection Pooling**: Hyperdrive handles connection pooling and caching

## Setup

### Prerequisites

- Node.js 18+ installed
- Cloudflare account
- Wrangler CLI configured
- Hyperdrive configuration created and connected to your PostgreSQL database

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. The Hyperdrive configuration is already set in `wrangler.jsonc`:
   - Binding name: `HYPERDRIVE`
   - Hyperdrive ID: `0aaa4c6875b64d9ebbafda4ca364eefb`

### Development

Start the development server:
```bash
npm run dev
```

This will start a local server (usually at `http://localhost:8787`) where you can test the application.

### Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

Your application will be deployed to: `https://train-db-viewer.YOUR_SUBDOMAIN.workers.dev`

## API Endpoints

### GET /api/train-cars

Fetches train cars data with optional filtering and pagination.

**Query Parameters:**
- `search` (optional): Search term to filter results
- `limit` (optional): Number of records per page (default: 50)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**
```json
{
  "data": [
    {
      "vehicle_id": 9,
      "name": "Spirit of Campbell River",
      "status": "In Service",
      "delivery_date": null,
      "enter_service_date": null,
      "batch_id": 1,
      "notes": null
    }
  ],
  "total": 356,
  "limit": 50,
  "offset": 0
}
```

## Database Schema

The application connects to a `train_cars` table with the following structure:

```sql
CREATE TABLE train_cars (
  vehicle_id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  status status_enum_d2b2cfd5 NOT NULL DEFAULT 'In Service',
  delivery_date TEXT,
  enter_service_date TEXT,
  batch_id INTEGER,
  notes TEXT
);
```

**Status Values:**
- In Service (green badge)
- In Testing (blue badge)
- Retired (gray badge)
- Scrapped (red badge)
- Sold (yellow badge)
- Unknown (light gray badge)

The search functionality searches across: vehicle_id, name, status, delivery_date, enter_service_date, and notes.

## Customization

### Styling
The CSS is embedded in the HTML response in `src/index.ts`. Look for the `<style>` tag to customize colors, fonts, and layout.

### Page Size
Change the `pageSize` constant in the JavaScript section or the `limit` default in the API handler.

### Search Fields
Modify the `WHERE` clause in the `getTrainCars` function to add or remove searchable fields.

## Performance

- **Hyperdrive Benefits**: Reduces database connection latency by up to 7x
- **Connection Pooling**: Reuses database connections across requests
- **Edge Caching**: Static assets cached at Cloudflare's edge
- **Efficient Queries**: Uses pagination and indexed searches

## Troubleshooting

### Database Connection Errors
- Verify your Hyperdrive configuration is correct
- Check that your database allows connections from Cloudflare IPs
- Ensure the `train_cars` table exists

### Search Not Working
- Verify column names match your database schema
- Check the query construction in the `getTrainCars` function

### Deployment Issues
- Run `wrangler whoami` to verify authentication
- Check `wrangler.jsonc` for correct Hyperdrive binding

## License

MIT

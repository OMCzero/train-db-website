export interface Env {
  HYPERDRIVE: Hyperdrive;
}

export interface TrainCar {
  vehicle_id: number;
  name: string | null;
  status: string;
  delivery_date: string | null;
  enter_service_date: string | null;
  batch_id: number | null;
  notes: string | null;
  model_common_name?: string | null;
  manufacturer?: string | null;
  manufacture_location?: string | null;
  years_manufactured?: string | null;
  full_name?: string | null;
}

export interface Marriage {
  marriage_id: number;
  batch_id: number;
  cars: number[];
  marriage_size: number;
}

export interface TrainCarsResponse {
  data: TrainCar[];
  total: number;
  limit: number;
  offset: number;
  lastUpdated: string | null;
  marriages: Marriage[] | null;
}

export class ApiError extends Error {
  code: string;
  status: number;
  extra?: Record<string, unknown>;

  constructor(code: string, message: string, status: number, extra?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; [key: string]: unknown } } = {};
    try {
      body = await res.json();
    } catch {
      // no JSON body
    }
    throw new ApiError(
      body.error?.code ?? 'UNKNOWN',
      body.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
      body.error
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface OrderWithDerived {
  _id: string;
  customer: string;
  dueDate: string;
  lineItems: LineItemInput[];
  subtotalMinor: number;
  totalMinor: number;
  amountPaidMinor: number;
  status: 'pending' | 'partially_paid' | 'paid';
  displayStatus: 'pending' | 'partially_paid' | 'paid' | 'overdue';
  amountDueMinor: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  _id: string;
  orderId: string;
  amountMinor: number;
  paidDate: string;
  note?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export function signup(input: { email: string; password: string }) {
  return request<Record<string, never>>('/api/auth/signup', { method: 'POST', body: JSON.stringify(input) });
}

export function login(input: { email: string; password: string }) {
  return request<Record<string, never>>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) });
}

export function logout() {
  return request<Record<string, never>>('/api/auth/logout', { method: 'POST' });
}

export function fetchOrders(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<OrderWithDerived[]>(`/api/orders${qs}`);
}

export function fetchOrder(id: string) {
  return request<{ order: OrderWithDerived; payments: Payment[] }>(`/api/orders/${id}`);
}

export function createOrder(input: { customer: string; dueDate: string; lineItems: LineItemInput[] }) {
  return request<OrderWithDerived>('/api/orders', { method: 'POST', body: JSON.stringify(input) });
}

export function deleteOrder(id: string) {
  return request<undefined>(`/api/orders/${id}`, { method: 'DELETE' });
}

export function createPayment(
  orderId: string,
  input: { amountMinor: number; paidDate: string; note?: string },
  idempotencyKey: string
) {
  return request<{ payment: Payment; order: OrderWithDerived }>(`/api/orders/${orderId}/payments`, {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

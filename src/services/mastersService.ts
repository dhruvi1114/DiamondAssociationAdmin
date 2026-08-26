import { ENDPOINTS } from '@/constant/endpoints';
import { BaseService, type ApiResult } from '@/services/BaseService';

/**
 * Membership catalogue API (M2). Mirrors `backend/src/modules/masters` exactly —
 * money crosses the wire as a 2-decimal **string**, never a JSON number, because
 * a float is what turns ₹25,000.10 into ₹25,000.099999 (ADR-007).
 */

export type FeeType = 'NEW_MEMBERSHIP' | 'RENEWAL' | 'EVENT_DEFAULT';
export type DocumentAppliesTo = 'APPLICATION' | 'MEMBER' | 'BOTH';

/** Whether a document is collected as one file or as a front and a back. */
export type DocumentSides = 'SINGLE' | 'FRONT_AND_BACK';

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  tier_count?: string;
  fee_count?: string;
  /** ISO 8601, UTC. Serialised camelCase by the API, unlike the columns above. */
  createdAt: string;
  updatedAt: string;
}

export interface Tier {
  id: string;
  category_id: string;
  category_name?: string;
  code: string;
  name: string;
  description: string | null;
  display_order: number;
  is_active: boolean;
  fee_count?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Fee {
  id: string;
  category_id: string | null;
  category_name?: string | null;
  tier_id: string | null;
  tier_name: string | null;
  fee_type: FeeType;
  amount: string;
  tax_rate: string;
  currency: string;
  duration_months: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedFee {
  fee_structure_id: string;
  category_name: string;
  tier_name: string | null;
  amount: string;
  tax_rate: string;
  tax_amount: string;
  total_amount: string;
  currency: string;
  duration_months: number;
  effective_from: string;
  effective_to: string | null;
}

export interface DocumentType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  applies_to: DocumentAppliesTo;
  is_required: boolean;
  sides: DocumentSides;
  max_size_mb: number;
  allowed_mime: string[];
  display_order: number;
  is_active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  activeOnly?: boolean;
  /** All three are comma-separated lists — the controls are multi-selects. */
  category_id?: string;
  fee_type?: string;
  applies_to?: string;
  /**
   * Category list filters. Declared here with the other endpoint-specific keys
   * rather than spread ad hoc at the call site: `query()` serialises whatever it
   * is handed, so an untyped param is one typo away from being silently dropped
   * with no compiler error and no failing request.
   *
   * `status` is not `activeOnly` — see the note on the server's schema. Dates
   * are plain `YYYY-MM-DD`.
   */
  /** Comma-separated: `active`, `inactive`, or both. */
  status?: string;
  created_from?: string;
  created_to?: string;
  /** Fees only — the window the price applies IN, not when the row was typed. */
  effective_from?: string;
  effective_to?: string;
  country_id?: string;
  state_id?: string;
}

export interface CompanyType {
  id: string;
  code: string;
  name: string;
  display_order: number;
  is_active: boolean;
  member_count?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Country {
  id: string;
  iso_code: string;
  name: string;
  display_order: number;
  is_active: boolean;
  state_count?: string;
  createdAt: string;
  updatedAt: string;
}

export interface State {
  id: string;
  country_id: string;
  country_name?: string;
  code: string;
  name: string;
  is_active: boolean;
  city_count?: string;
  createdAt: string;
  updatedAt: string;
}

export interface City {
  id: string;
  state_id: string;
  state_name?: string;
  country_name?: string;
  name: string;
  is_active: boolean;
  address_count?: string;
  createdAt: string;
  updatedAt: string;
}

const query = (params: ListParams = {}): string => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  });
  const qs = search.toString();

  return qs ? `?${qs}` : '';
};

export const MastersService = {
  listCategories: (params?: ListParams): Promise<ApiResult<Category[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.CATEGORIES}${query(params)}`),
  createCategory: (body: Partial<Category>) =>
    BaseService.post<Category>(ENDPOINTS.MASTERS.CATEGORIES, body),
  updateCategory: (id: string, body: Partial<Category>) =>
    BaseService.patch<Category>(ENDPOINTS.MASTERS.category(id), body),
  deleteCategory: (id: string) => BaseService.delete(ENDPOINTS.MASTERS.category(id)),

  listTiers: (params?: ListParams): Promise<ApiResult<Tier[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.TIERS}${query(params)}`),
  createTier: (body: Partial<Tier>) => BaseService.post<Tier>(ENDPOINTS.MASTERS.TIERS, body),
  updateTier: (id: string, body: Partial<Tier>) =>
    BaseService.patch<Tier>(ENDPOINTS.MASTERS.tier(id), body),
  deleteTier: (id: string) => BaseService.delete(ENDPOINTS.MASTERS.tier(id)),

  listFees: (params?: ListParams): Promise<ApiResult<Fee[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.FEES}${query(params)}`),
  createFee: (body: Record<string, unknown>) => BaseService.post<Fee>(ENDPOINTS.MASTERS.FEES, body),
  updateFee: (id: string, body: Record<string, unknown>) =>
    BaseService.patch<Fee>(ENDPOINTS.MASTERS.fee(id), body),
  resolveFee: (params: {
    category_id?: string;
    tier_id?: string;
    fee_type: FeeType;
    on_date?: string;
  }) =>
    BaseService.get<ResolvedFee>(`${ENDPOINTS.MASTERS.FEE_RESOLVE}${query(params as ListParams)}`),

  listCompanyTypes: (params?: ListParams): Promise<ApiResult<CompanyType[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.COMPANY_TYPES}${query(params)}`),
  createCompanyType: (body: Partial<CompanyType>) =>
    BaseService.post<CompanyType>(ENDPOINTS.MASTERS.COMPANY_TYPES, body),
  updateCompanyType: (id: string, body: Partial<CompanyType>) =>
    BaseService.patch<CompanyType>(ENDPOINTS.MASTERS.companyType(id), body),
  deleteCompanyType: (id: string) => BaseService.delete(ENDPOINTS.MASTERS.companyType(id)),

  listCountries: (params?: ListParams): Promise<ApiResult<Country[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.COUNTRIES}${query(params)}`),
  createCountry: (body: Partial<Country>) =>
    BaseService.post<Country>(ENDPOINTS.MASTERS.COUNTRIES, body),
  updateCountry: (id: string, body: Partial<Country>) =>
    BaseService.patch<Country>(ENDPOINTS.MASTERS.country(id), body),
  deleteCountry: (id: string) => BaseService.delete(ENDPOINTS.MASTERS.country(id)),

  listStates: (params?: ListParams): Promise<ApiResult<State[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.STATES}${query(params)}`),
  createState: (body: Record<string, unknown>) =>
    BaseService.post<State>(ENDPOINTS.MASTERS.STATES, body),
  updateState: (id: string, body: Record<string, unknown>) =>
    BaseService.patch<State>(ENDPOINTS.MASTERS.state(id), body),
  deleteState: (id: string) => BaseService.delete(ENDPOINTS.MASTERS.state(id)),

  listCities: (params?: ListParams): Promise<ApiResult<City[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.CITIES}${query(params)}`),
  createCity: (body: Record<string, unknown>) =>
    BaseService.post<City>(ENDPOINTS.MASTERS.CITIES, body),
  updateCity: (id: string, body: Record<string, unknown>) =>
    BaseService.patch<City>(ENDPOINTS.MASTERS.city(id), body),
  deleteCity: (id: string) => BaseService.delete(ENDPOINTS.MASTERS.city(id)),

  listDocumentTypes: (params?: ListParams): Promise<ApiResult<DocumentType[]>> =>
    BaseService.get(`${ENDPOINTS.MASTERS.DOCUMENT_TYPES}${query(params)}`),
  createDocumentType: (body: Record<string, unknown>) =>
    BaseService.post<DocumentType>(ENDPOINTS.MASTERS.DOCUMENT_TYPES, body),
  updateDocumentType: (id: string, body: Record<string, unknown>) =>
    BaseService.patch<DocumentType>(ENDPOINTS.MASTERS.documentType(id), body),
  deleteDocumentType: (id: string) => BaseService.delete(ENDPOINTS.MASTERS.documentType(id)),
};

export default MastersService;

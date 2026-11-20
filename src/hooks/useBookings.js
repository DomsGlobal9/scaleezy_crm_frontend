import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

/**
 * A boutique's appointments and leads (the mockup approved 20 Nov). Only a shop that uses Boutique has them: the
 * answers say `using: false` otherwise, and every screen stays hidden. Every change refreshes the diary, the leads and
 * the customer's page together.
 */
export function useAppointments(params, enabled = true) {
  return useQuery({ queryKey: ['appointments', params], queryFn: async () => (await api.get('/appointments', { params })).data, enabled, refetchInterval: 60_000 });
}
export function useCustomerAppointments(customerId, enabled = true) {
  return useQuery({ queryKey: ['customer', customerId, 'appointments'], queryFn: async () => (await api.get(`/customers/${customerId}/appointments`)).data, enabled: !!customerId && enabled });
}
export function useLeads(show, enabled = true) {
  return useQuery({ queryKey: ['leads', show], queryFn: async () => (await api.get('/leads', { params: { show } })).data, enabled, refetchInterval: 60_000 });
}
export function useLead(id) {
  return useQuery({ queryKey: ['lead', id], queryFn: async () => (await api.get(`/leads/${id}`)).data, enabled: !!id });
}

function useFresh() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['leads'] });
    qc.invalidateQueries({ queryKey: ['lead'] });
    qc.invalidateQueries({ queryKey: ['customer'] });
  };
}
export function useBook() {
  const fresh = useFresh();
  return useMutation({ mutationFn: async (body) => (await api.post('/appointments', body)).data, onSuccess: fresh });
}
export function useChangeAppointment() {
  const fresh = useFresh();
  return useMutation({ mutationFn: async ({ id, ...body }) => (await api.patch(`/appointments/${id}`, body)).data, onSuccess: fresh });
}
export function useReminderSetting() {
  const fresh = useFresh();
  return useMutation({ mutationFn: async (reminders) => (await api.put('/appointments/settings', { reminders })).data, onSuccess: fresh });
}
export function useAddLead() {
  const fresh = useFresh();
  return useMutation({ mutationFn: async (body) => (await api.post('/leads', body)).data, onSuccess: fresh });
}
export function useChangeLead() {
  const fresh = useFresh();
  return useMutation({ mutationFn: async ({ id, ...body }) => (await api.patch(`/leads/${id}`, body)).data, onSuccess: fresh });
}
export function useReplyLead() {
  const fresh = useFresh();
  return useMutation({ mutationFn: async ({ id, text, ref }) => (await api.post(`/leads/${id}/reply`, { text, ref })).data, onSuccess: fresh });
}

export const KINDS = [
  { key: 'consultation', label: 'Consultation', minutes: 60 },
  { key: 'measurement', label: 'Measurement', minutes: 30 },
  { key: 'trial', label: 'Trial', minutes: 30 },
  { key: 'delivery', label: 'Delivery', minutes: 15 },
  { key: 'other', label: 'Other', minutes: 30 }
];
export const SOURCES = [
  { key: 'website', label: 'Website' }, { key: 'instagram', label: 'Instagram' }, { key: 'facebook', label: 'Facebook' },
  { key: 'counter', label: 'Asked at the counter' }, { key: 'call', label: 'Phone call' }, { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'referral', label: 'A friend sent them' }, { key: 'other', label: 'Somewhere else' }
];
export const sourceWords = (k) => SOURCES.find(s => s.key === k)?.label ?? k;
export const LOST_REASONS = [
  { key: 'price', label: 'Price' }, { key: 'timing', label: 'Timing' }, { key: 'went-elsewhere', label: 'Went elsewhere' },
  { key: 'not-reachable', label: 'Could not reach them' }, { key: 'other', label: 'Something else' }
];

/** "11:00" / "4:30 pm" in the viewer's clock (the shop's, for staff at the shop). */
export const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([AP])M$/i, (_, x) => ` ${x.toLowerCase()}m`);
export const dayName = (iso) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
/** "2026-11-21" for a Date, in the viewer's clock. */
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n)); };
export const howLong = (m) => (m >= 60 ? `${m / 60 === Math.floor(m / 60) ? m / 60 : (m / 60).toFixed(1)} hr` : `${m} min`);
export const ago = (iso) => {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
};
export const STATUS_WORDS = { booked: 'Booked', confirmed: 'Confirmed', came: 'Came', missed: 'Missed', cancelled: 'Cancelled' };

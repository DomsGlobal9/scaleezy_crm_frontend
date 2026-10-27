import axios from 'axios';
import { API_BASE_URL } from './config';

/**
 * The one client every screen talks through. The same contract as Inventory's lib/api.ts:
 * responses are unwrapped to their body, and every rejection is a plain { message } a shop owner
 * can read -- never an axios sentence, never anything shaped like an engine error.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // the httpOnly cookie Inventory set
  timeout: 90000
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject({ message: 'The server took too long to respond. Check your connection and try again.', statusCode: 0 });
    }
    if (!error.response && error.code === 'ERR_NETWORK') {
      return Promise.reject({ message: 'Could not reach the server. Check your connection and try again.', statusCode: 0 });
    }
    const status = error.response?.status;
    const body = error.response?.data;
    // A 401 is "not signed in", which the app draws as a screen rather than a toast; AuthContext
    // listens for it and takes the person to the sign-in notice.
    if (status === 401) window.dispatchEvent(new Event('scaleezy:signed-out'));
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      return Promise.reject(Object.assign(body, { statusCode: body.statusCode ?? status }));
    }
    return Promise.reject({ message: 'Something went wrong at our end. Please try again.', statusCode: status });
  }
);

export { api };

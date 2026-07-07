import axios from 'axios';

// Use the same env var as api.ts so it works in both dev and prod
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

export interface ProfileForm {
  fullName: string;
  email: string;
  dateOfBirth: string;
  dateOfJoining: string;
  mobileNo: string;
  currentAddress: string;
}

export interface ProfileResponse extends ProfileForm {
  username: string;
  hasProfilePicture: boolean;
  // Annual leave entitlement in days, computed server-side from
  // dateOfJoining: 24 once the employee has completed 3 years of service,
  // 18 before that.
  leaveLimit: number;
}

// Get auth token from localStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  };
};

// In-memory cache for profile picture blob URLs so we don't re-fetch on
// every render. Keys are usernames. Invalidated explicitly after upload.
const pictureCache = new Map<string, string | null>();

/**
 * Returns a blob object-URL for the user's profile picture,
 * or null if they have none.  Result is cached in memory.
 */
export const fetchProfilePicture = async (username: string): Promise<string | null> => {
  if (pictureCache.has(username)) {
    return pictureCache.get(username) ?? null;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_BASE_URL}/profile/picture/${username}`, {
      headers: { 'Authorization': `Bearer ${token}` },
      responseType: 'blob',
    });

    if (response.data && response.data.size > 0) {
      const objectUrl = URL.createObjectURL(response.data);
      pictureCache.set(username, objectUrl);
      return objectUrl;
    }
    pictureCache.set(username, null);
    return null;
  } catch (error: any) {
    if (error.response?.status !== 404) {
      console.error('Failed to fetch profile picture:', error);
    }
    pictureCache.set(username, null);
    return null;
  }
};

/**
 * Returns the raw URL string (for use in <img src> with auth headers
 * handled externally, e.g. in MyProfile which does its own fetch).
 */
export const getProfilePictureUrl = (username: string): string => {
  return `${API_BASE_URL}/profile/picture/${username}`;
};

/**
 * Clears the in-memory blob-URL cache for a user so the next render
 * re-fetches the freshly uploaded picture.
 */
export const invalidateProfilePictureCache = (username: string): void => {
  const existing = pictureCache.get(username);
  if (existing) {
    URL.revokeObjectURL(existing);
  }
  pictureCache.delete(username);
};

export const getOwnProfile = async (): Promise<ProfileResponse> => {
  const response = await axios.get(`${API_BASE_URL}/profile/me`, getAuthHeaders());
  return response.data;
};

export const getProfile = async (username: string): Promise<ProfileResponse> => {
  const response = await axios.get(`${API_BASE_URL}/profile/${username}`, getAuthHeaders());
  return response.data;
};

export const updateOwnProfile = async (profile: ProfileForm): Promise<void> => {
  await axios.put(`${API_BASE_URL}/profile/me`, profile, getAuthHeaders());
};

export const updateProfile = async (username: string, profile: ProfileForm): Promise<void> => {
  await axios.put(`${API_BASE_URL}/profile/${username}`, profile, getAuthHeaders());
};

export const uploadOwnPicture = async (file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('token');
  await axios.post(`${API_BASE_URL}/profile/me/picture`, formData, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    }
  });
};

export const uploadPicture = async (username: string, file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('token');
  await axios.post(`${API_BASE_URL}/profile/${username}/picture`, formData, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    }
  });
};
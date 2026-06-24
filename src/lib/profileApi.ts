import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080';

export interface ProfileForm {
  fullName: string;
  email: string;
  dateOfBirth: string;
  mobileNo: string;
  currentAddress: string;
}

export interface ProfileResponse extends ProfileForm {
  username: string;
  hasProfilePicture: boolean;
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

// FIXED: Function to fetch profile picture as blob
export const fetchProfilePicture = async (username: string): Promise<string | null> => {
  try {
    const token = localStorage.getItem('token');
    console.log(`Fetching profile picture for ${username}...`);
    
    const response = await axios.get(`${API_BASE_URL}/profile/picture/${username}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      responseType: 'blob',
    });
    
    if (response.data && response.data.size > 0) {
      console.log(`Picture fetched successfully, size: ${response.data.size} bytes`);
      // Create an object URL from the blob
      const objectUrl = URL.createObjectURL(response.data);
      return objectUrl;
    }
    console.warn('No picture data received');
    return null;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('No profile picture found for user');
    } else {
      console.error('Failed to fetch profile picture:', error);
    }
    return null;
  }
};

// Alternative: Get the URL for direct image access
export const getProfilePictureUrl = (username: string): string => {
  return `${API_BASE_URL}/profile/picture/${username}`;
};

export const getOwnProfile = async (): Promise<ProfileResponse> => {
  console.log('Fetching own profile...');
  const response = await axios.get(`${API_BASE_URL}/profile/me`, getAuthHeaders());
  console.log('Profile response:', response.data);
  return response.data;
};

export const getProfile = async (username: string): Promise<ProfileResponse> => {
  const response = await axios.get(`${API_BASE_URL}/profile/${username}`, getAuthHeaders());
  return response.data;
};

export const updateOwnProfile = async (profile: ProfileForm): Promise<void> => {
  console.log('Updating profile:', profile);
  await axios.put(`${API_BASE_URL}/profile/me`, profile, getAuthHeaders());
  console.log('Profile updated successfully');
};

export const updateProfile = async (username: string, profile: ProfileForm): Promise<void> => {
  await axios.put(`${API_BASE_URL}/profile/${username}`, profile, getAuthHeaders());
};

export const uploadOwnPicture = async (file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file);
  
  const token = localStorage.getItem('token');
  console.log('Uploading profile picture...');
  
  await axios.post(`${API_BASE_URL}/profile/me/picture`, formData, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    }
  });
  
  console.log('Profile picture uploaded successfully');
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

export const invalidateProfilePictureCache = (username: string): void => {
  console.log('Invalidating profile picture cache for:', username);
  // Nothing needed here as we're using object URLs
};
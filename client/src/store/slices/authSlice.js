import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authAPI, adminAPI, hospitalAdminAPI } from '../../utils/api';

// Async Thunks
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ email, password, hospitalId }, { rejectWithValue }) => {
    try {
      const response = await authAPI.login(email, password, hospitalId);
      if (response.success) {
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Login failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const signupUser = createAsyncThunk(
  'auth/signupUser',
  async ({ name, email, password, phone }, { rejectWithValue }) => {
    try {
      const response = await authAPI.signup(name, email, password, phone);
      if (response.success) {
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Signup failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Signup failed');
    }
  }
);

export const loginAdmin = createAsyncThunk(
  'auth/loginAdmin',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await adminAPI.login(email, password);
      if (response.success) {
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Login failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const loginHospitalAdmin = createAsyncThunk(
  'auth/loginHospitalAdmin',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const response = await hospitalAdminAPI.login(email, password);
      if (response.success) {
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Login failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const signupAdmin = createAsyncThunk(
  'auth/signupAdmin',
  async ({ name, email, password, phone }, { rejectWithValue }) => {
    try {
      const response = await adminAPI.signup(name, email, password, phone);
      if (response.success) {
        localStorage.setItem('user', JSON.stringify(response.user));
        return response;
      }
      return rejectWithValue(response.message || 'Signup failed');
    } catch (error) {
      return rejectWithValue(error.response?.data?.message || 'Signup failed');
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { dispatch }) => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Server logout failed:', error);
    }
    dispatch(logout());
  }
);

// Load initial state from localStorage
const loadInitialState = () => {
  try {
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    return {
      user,
      isAuthenticated: !!user,
      // sessionRestoring: true when app boots with a cached user and is validating
      // the session with the backend. Dashboard is hidden until this becomes false.
      sessionRestoring: !!user,
      loading: false,
      error: null,
      idleWarningActive: false,
    };
  } catch {
    return {
      user: null,
      isAuthenticated: false,
      sessionRestoring: false,
      loading: false,
      error: null,
      idleWarningActive: false,
    };
  }
};

const authSlice = createSlice({
  name: 'auth',
  initialState: loadInitialState(),
  reducers: {
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.sessionRestoring = false;
      state.error = null;
      state.idleWarningActive = false;
      localStorage.removeItem('user');
    },
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload };
      localStorage.setItem('user', JSON.stringify(state.user));
    },
    // ── Session restoration loading state ────────────────────────────────
    // True while the app is validating a cached session with the backend.
    // The dashboard is gated behind sessionRestoring === false.
    setSessionRestoring: (state, action) => {
      state.sessionRestoring = !!action.payload;
    },
    // ── Idle notice (informational only — Persistent Session Policy) ──────
    showIdleWarning: (state) => {
      state.idleWarningActive = true;
    },
    hideIdleWarning: (state) => {
      state.idleWarningActive = false;
    },
  },
  extraReducers: (builder) => {
    // Login User
    builder.addCase(loginUser.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(loginUser.fulfilled, (state, action) => {
      state.loading = false;
      state.sessionRestoring = false;
      state.user = action.payload.user;
      state.isAuthenticated = true;
    });
    builder.addCase(loginUser.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Signup User
    builder.addCase(signupUser.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(signupUser.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.isAuthenticated = true;
    });
    builder.addCase(signupUser.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Login Admin
    builder.addCase(loginAdmin.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(loginAdmin.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.isAuthenticated = true;
    });
    builder.addCase(loginAdmin.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Signup Admin
    builder.addCase(signupAdmin.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(signupAdmin.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.isAuthenticated = true;
    });
    builder.addCase(signupAdmin.rejected, (state, action) => { state.loading = false; state.error = action.payload; });

    // Login Hospital Admin
    builder.addCase(loginHospitalAdmin.pending, (state) => { state.loading = true; state.error = null; });
    builder.addCase(loginHospitalAdmin.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.isAuthenticated = true;
    });
    builder.addCase(loginHospitalAdmin.rejected, (state, action) => { state.loading = false; state.error = action.payload; });
  },
});

export const { logout, clearError, updateUser, showIdleWarning, hideIdleWarning, setSessionRestoring } = authSlice.actions;
export default authSlice.reducer;

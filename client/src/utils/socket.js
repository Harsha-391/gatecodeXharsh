import io from 'socket.io-client';

const getSocketURL = () => {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
};

const socket = io(getSocketURL(), {
    autoConnect: false, // Connect manually when authenticated
    transports: ["websocket", "polling"],
    withCredentials: true
});

export default socket;

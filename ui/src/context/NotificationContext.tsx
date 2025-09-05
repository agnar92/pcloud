import { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notification, setNotification] = useState(null);

  const addNotification = useCallback((message, type = 'info') => {
    const id = Date.now();
    setNotification({ id, message, type });
    setTimeout(() => {
      setNotification(curr => (curr?.id === id ? null : curr));
    }, 4000);
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification }}>
      {children}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.3 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
            className="fixed bottom-10 right-10 z-50"
          >
            <div
              className={`px-6 py-3 rounded-lg shadow-2xl text-white font-semibold border ${
                notification.type === 'success' ? 'bg-green-500/80 border-green-400' : ''
              } ${
                notification.type === 'error' ? 'bg-red-500/80 border-red-400' : ''
              } ${
                notification.type === 'info' ? 'bg-blue-500/80 border-blue-400' : ''
              }`}>
              {notification.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </NotificationContext.Provider>
  );
}

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

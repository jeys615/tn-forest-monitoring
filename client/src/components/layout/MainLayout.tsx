import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import { COLORS, SPACE } from '../../styles/theme';

const MainLayout: React.FC = () => {
  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: COLORS.bg,
      }}
    >
      {/* Sidebar: fixed height, independent scroll for nav */}
      <Sidebar />
      {/* Right column: header + scrollable content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          overflow: 'hidden',
        }}
      >
        <Header />
        <main
          style={{
            flex: 1,
            padding: SPACE['2xl'],
            backgroundColor: COLORS.bg,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;

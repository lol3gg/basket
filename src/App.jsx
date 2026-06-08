import AstaTorneo from './asta-torneo.jsx';
import BasketballDecor from './BasketballDecor.jsx';
import { PoweredByDevology } from './PoweredByDevology.jsx';
import { isMobileDevice } from './asta-setup.js';

export default function App() {
  return (
    <>
      {!isMobileDevice() && <PoweredByDevology />}
      <BasketballDecor />
      <AstaTorneo />
    </>
  );
}

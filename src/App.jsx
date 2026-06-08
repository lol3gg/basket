import AstaTorneo from './asta-torneo.jsx';
import BasketballDecor from './BasketballDecor.jsx';
import { PoweredByDevology } from './PoweredByDevology.jsx';
import { isMobileDevice } from './asta-setup.js';
import { useTvDisplayFit } from './useTvDisplayFit.js';

export default function App() {
  useTvDisplayFit();

  return (
    <>
      {!isMobileDevice() && <PoweredByDevology />}
      <BasketballDecor />
      <AstaTorneo />
    </>
  );
}

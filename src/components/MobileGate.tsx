import { MobileGateLogo } from "./MobileGateLogo";

export function MobileGate({ onRandomizeAll }: { onRandomizeAll: () => void }) {
  return (
    <div className="mobile-gate" role="status">
      <p className="mobile-gate__copy mobile-gate__copy--top">
        Not intended for mobile screens, please go sit down at a real computer.
      </p>
      <div className="mobile-gate__logo">
        <MobileGateLogo ariaLabel="Randomize all" onClick={onRandomizeAll} />
      </div>
      <p className="mobile-gate__copy mobile-gate__copy--bottom">Hey tap the logotype!</p>
    </div>
  );
}

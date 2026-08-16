import { BrandLogo } from "./BrandLogo";
import { playUiSound } from "../ui/sounds";

export function MobileGate({ onRandomizeAll }: { onRandomizeAll: () => void }) {
  return (
    <div className="mobile-gate" role="status">
      <div className="mobile-gate__logo">
        <BrandLogo
          className="mobile-gate__mark"
          alwaysCycle
          ariaLabel="Randomize all"
          onClick={() => {
            playUiSound("push");
            onRandomizeAll();
          }}
        />
      </div>
      <p className="mobile-gate__copy">
        Not intended for mobile screens, please go sit down at a real computer.
      </p>
    </div>
  );
}

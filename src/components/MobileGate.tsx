import { BrandLogo } from "./BrandLogo";

export function MobileGate() {
  return (
    <div className="mobile-gate" role="status">
      <div className="mobile-gate__logo">
        <BrandLogo className="mobile-gate__mark" alwaysCycle />
      </div>
      <p className="mobile-gate__copy">
        Not intended for mobile screens, please go sit down at a real computer.
      </p>
    </div>
  );
}

import { chatInputBorderRadius } from "../constants";
import { LumpToolbar } from "./LumpToolbar/LumpToolbar";

/**
 * Simplified toolbar component that only shows the toolbar without expansion
 */
export function Lump() {
  return (
    <div
      className="mx-1.5 border-l border-r border-t bg-transparent"
      style={{
        borderTopLeftRadius: chatInputBorderRadius,
        borderTopRightRadius: chatInputBorderRadius,
      }}
    >
      <div className="xs:px-2 px-1 py-0.5">
        <LumpToolbar />
      </div>
    </div>
  );
}

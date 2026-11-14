import type { JSX } from "solid-js";
import FolderOpen from "lucide-solid/icons/folder-open";
import { StatePanel } from "./state-panel";
export function EmptyState(props: {
  title: string;
  description: string;
  icon?: JSX.Element;
}) {
  return (
    <StatePanel
      role="status"
      icon={props.icon ?? <FolderOpen size={28} strokeWidth={1.75} />}
      title={props.title}
      description={props.description}
    />
  );
}

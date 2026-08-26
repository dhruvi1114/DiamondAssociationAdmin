import { Card, EmptyState } from '@/components/ui';

export interface PlaceholderProps {
  /**
   * Screen name. Not rendered — the shell header already draws it from the same
   * nav table — but kept on the props so the route table reads as a complete
   * description of the screen it registers.
   */
  title: string;
  /** Cycle that will implement this screen, e.g. "M4". */
  module: string;
  /** Nav group the screen sits in. Kept for the route table; not rendered. */
  group?: string;
  /** One sentence describing what will live here, from screen-inventory.md. */
  description: string;
}

/**
 * Stub for a nav destination whose cycle has not run yet.
 *
 * It exists so the shell, routing and permission gating can be exercised and
 * reviewed in M0 without pretending a feature is present. It states plainly
 * which cycle owns the screen rather than showing a blank page that reads as a
 * bug.
 */
export const Placeholder = ({ module, description }: PlaceholderProps) => (
  <div className="flex flex-col gap-4">
    {/*
      No breadcrumb and no heading of its own.

      The shell header already names the screen — it reads the same nav table
      this page is registered in, so a title here could only ever repeat it, and
      the page carried a second `h1` saying exactly what the first one said. The
      breadcrumb went with it: "Work / Change requests" is the group and the
      title, both of which the sidebar is showing as the selected item at the
      moment you read it, and neither half was a link to anywhere.

      Detail screens keep theirs — `MemberDetail` and `ApplicationReview` name a
      record the header cannot know about, and their crumbs go back to the list.
    */}
    <p className="m-0 text-12 text-fg-muted">{description}</p>

    <Card flush>
      <EmptyState
        title={`Arrives in ${module}`}
        description={`This screen is intentionally empty — it is scheduled for ${module}. The shell, theme, API client and permission checks it will be built from already exist.`}
      />
    </Card>
  </div>
);

export default Placeholder;

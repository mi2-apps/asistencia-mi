// Developer Manual — client route wiring.
// [EDIT] Add to your top-level router (e.g. client/src/App.tsx), ABOVE the catch-all
// "/*" route. This example uses wouter; adapt to react-router if needed.

import DeveloperManualViewer from "@/components/developer-manual/DeveloperManualViewer"; // [EDIT] adjust path

// inside <Switch> ... </Switch>, before <Route path="/*" ...>:
<Route path="/developer-manual" component={DeveloperManualViewer} />
<Route path="/developer-manual/:slug" component={DeveloperManualViewer} />

// The viewer self-restricts to admin/supervisor (it reads /api/auth/me). It renders
// Markdown with react-markdown + remark-gfm — add both deps if absent:
//   npm install react-markdown remark-gfm

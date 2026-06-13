// Developer Manual — session-router registration.
// [EDIT] Add to your main routes file (e.g. server/routes.ts):

// 1) import at top:
import developerManualRouter from './routes/developerManual';

// 2) mount alongside your other routers (canonical /api/v1/* is accepted via your
//    existing /api/v1 -> /api rewrite; if you have none, register at '/api/v1/developer-manual'):
app.use('/api/developer-manual', developerManualRouter);

// The session router restricts read+write to admin/supervisor and delete to admin,
// using req.session.user.role. [EDIT] If your session shape differs, adjust the
// requireAuth/requireManualAccess guards inside routes/developerManual.ts.

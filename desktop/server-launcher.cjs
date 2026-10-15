// Entry point the desktop app starts instead of server.js.
// Windows doesn't stop child processes when their parent dies, so if the app
// crashes or is force-closed, exit rather than linger in the background.
const parentPid = Number(process.env.SERMON_BRIEF_PARENT_PID);
if (parentPid) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0); // signal 0 only checks that the process exists
    } catch {
      process.exit(0);
    }
  }, 2000).unref();
}
require("./server.js");

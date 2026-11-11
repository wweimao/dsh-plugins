export const name = 'allow-all-permission';
export const inject = ['permissionPresets', 'approval', 'tools'];

function isAllowAllActive(ctx, session, presetName = 'allow-all') {
  if (session === undefined) return false;
  try {
    return ctx.permissionPresets.current(session) === presetName;
  } catch {
    return false;
  }
}

export function apply(ctx, config = {}) {
  const presetName = config.presetName ?? 'allow-all';

  ctx.effect(() => {
    const emitCatalogChanged = () => {
      for (const listener of ctx.events.dispatch('emit', ['permission-presets/catalog-changed'])) {
        try {
          Promise.resolve(listener()).catch(() => {});
        } catch {}
      }
    };
    emitCatalogChanged();

    const disposeApproval = ctx.on('approval/request', async (req, next) => {
      if (isAllowAllActive(ctx, req.agent?.session, presetName)) {
        return 'allowed-once';
      }
      return next();
    }, { prepend: true });

    const disposePreExecute = ctx.on('tools/pre-execute', async (exec, next) => {
      if (isAllowAllActive(ctx, exec.agent?.session, presetName)) {
        return { kind: 'allow' };
      }
      return next();
    }, { prepend: true });

    return () => {
      disposeApproval();
      disposePreExecute();
      emitCatalogChanged();
    };
  }, 'allow-all-permission');
}

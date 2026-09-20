export function selectLocalProfile(args = []) {
  const options = args.filter(value => value.startsWith('--profile'));
  if (options.length > 1 || (options.length === 1 && !['--profile=local', '--profile=p0'].includes(options[0]))) throw new Error('Select exactly one --profile=local or --profile=p0');
  return options.length ? options[0].slice('--profile='.length) : 'local';
}
export function requireMatchingProfile(running, profile) {
  if (running && !new RegExp(`--spring\\.profiles\\.active=${profile}(?:\\s|$)`).test(running.identity)) throw new Error('Backend is running a different profile; stop the project backend before switching profiles');
}

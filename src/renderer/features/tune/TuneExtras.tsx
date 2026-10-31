import { copy } from '../../app/copy';
import { tidyTune } from '../../music/tune';
import { commit } from '../../store/song';
import { showToast } from '../../store/ui';
import { currentLine } from './controller';

export function tidyNow(): void {
  const line = currentLine();
  if (!line?.tune) return;
  commit('Tidy timing', (song) => {
    const target = song.lines.find((l) => l.id === line.id);
    if (target?.tune) target.tune = tidyTune(target.tune);
  });
  showToast(copy.tune.tidied, true);
}

export function TuneMenus() {
  return null;
}

export function TuneActionsExtra() {
  return <button className="btn btn-outline" onClick={tidyNow}>{copy.tune.tidy}</button>;
}

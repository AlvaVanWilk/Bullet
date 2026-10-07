// "6 DIENSTAG" (or "DIENSTAG 6") in small capitals, set off as chosen in the
// settings. Used for the days of the week and for the samples in the settings.

import { weekMarker } from '../lib/colors';
import { dayNumber, isoWeek, weekdayName, type DayKey } from '../lib/dates';
import type { Settings } from '../lib/model';
import { HandBox } from './ink';

export function DayHeading(props: { day: DayKey; isToday: boolean; settings: Pick<Settings, 'dayFormat' | 'dayStyle'> }) {
  const num = <span class="dt-num">{dayNumber(props.day)}</span>;
  const name = <span class="dt-name">{weekdayName(props.day)}</span>;
  const text = (
    <span class="dt-text">
      {props.settings.dayFormat === 'tag' ? <>{name} {num}</> : <>{num} {name}</>}
    </span>
  );
  const note = props.isToday && <span class="today-note">heute</span>;
  const style = props.settings.dayStyle;
  if (style === 'rahmen') {
    return (
      <h2 class="day-title st-rahmen">
        <HandBox class="dt-box" seed={`day${props.day}`}>{text}</HandBox>
        {note}
      </h2>
    );
  }
  if (style === 'striche') {
    return (
      <h2 class="day-title st-striche">
        <span class="dt-rule" aria-hidden="true" />
        {text}
        {note}
        <span class="dt-rule" aria-hidden="true" />
      </h2>
    );
  }
  const marker = style === 'woche' ? { '--day-marker': weekMarker(isoWeek(props.day)) } : undefined;
  return (
    <h2 class={`day-title st-${style === 'woche' ? 'marker' : style}`} style={marker}>
      {text}
      {note}
    </h2>
  );
}

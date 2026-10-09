// A line to write something new on (a task, a category, a project): Enter
// adds it, Esc leaves the line and the text goes.

import { useState } from 'preact/hooks';

export function NewLine(props: { placeholder: string; onEnter: (text: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      class="new-line"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        props.onEnter(value);
        setValue('');
      }}
    >
      <span class="new-line-mark" aria-hidden="true">+</span>
      <input
        value={value}
        onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setValue(''); (e.currentTarget as HTMLInputElement).blur(); }
        }}
        placeholder={props.placeholder}
        enterKeyHint="enter"
        autoComplete="off"
        autoCorrect="on"
        spellcheck={true}
      />
    </form>
  );
}

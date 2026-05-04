import { normalizeItem, validateItem } from '@repo/shared';
import { useState } from 'react';

export function App() {
  const [title, setTitle] = useState('');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    const candidate = { title };
    if (!validateItem(candidate)) {
      setError('Title is required.');
      return;
    }
    setError('');
    setItems((prev) => [...prev, { ...normalizeItem(candidate), id: crypto.randomUUID() }]);
    setTitle('');
  }

  return (
    <main>
      <h1>Repo Web</h1>
      <form onSubmit={submit}>
        <label htmlFor="title">Item title</label>
        <input id="title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">Add item</button>
        {error ? <div role="alert">{error}</div> : null}
      </form>
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            {it.title} × {it.quantity}
          </li>
        ))}
      </ul>
    </main>
  );
}

'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, ListTodo, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { cn } from '@/lib/utils';
import type { MilitaryTodo } from '@/lib/types';

// The student's own private التربية العسكرية checklist -- separate from the admin-broadcast
// military assignments shown in the AssignmentsBoard below it.
export function MilitaryTodoList({ initialTodos }: { initialTodos: MilitaryTodo[] }) {
  const { showToast } = useToast();
  const [todos, setTodos] = useState<MilitaryTodo[]>(initialTodos);
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || adding) return;
    setAdding(true);
    try {
      const created = await api.post<MilitaryTodo>('/military/todos', { text: value });
      setTodos((prev) => [...prev, created]);
      setText('');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'تعذّرت إضافة المهمة.', 'error');
    } finally {
      setAdding(false);
    }
  }

  async function toggle(todo: MilitaryTodo) {
    const next = !todo.done;
    setTodos((prev) => prev.map((t) => (t._id === todo._id ? { ...t, done: next } : t)));
    try {
      await api.patch(`/military/todos/${todo._id}`, { done: next });
    } catch {
      setTodos((prev) => prev.map((t) => (t._id === todo._id ? { ...t, done: !next } : t)));
    }
  }

  async function remove(id: string) {
    const prev = todos;
    setTodos((p) => p.filter((t) => t._id !== id));
    try {
      await api.delete(`/military/todos/${id}`);
    } catch {
      setTodos(prev);
      showToast('تعذّر حذف المهمة.', 'error');
    }
  }

  const doneCount = todos.filter((t) => t.done).length;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <ListTodo className="h-4 w-4 text-accent" />
        قائمة مهامي
        {todos.length > 0 && (
          <span className="ms-auto text-xs font-normal text-muted-foreground">
            {doneCount}/{todos.length}
          </span>
        )}
      </div>

      <form onSubmit={addTodo} className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="أضف مهمة…" className="flex-1" />
        <Button type="submit" size="icon" loading={adding} aria-label="إضافة">
          <Plus className="h-4 w-4" />
        </Button>
      </form>

      {todos.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">لا توجد مهام بعد. أضف ما تريد إنجازه.</p>
      ) : (
        <ul className="space-y-1">
          {todos.map((todo) => (
            <li key={todo._id} className="group flex items-center gap-2 rounded-lg px-1 py-1.5">
              <button
                type="button"
                onClick={() => toggle(todo)}
                className={cn('shrink-0 transition-colors', todo.done ? 'text-success' : 'text-muted-foreground hover:text-success')}
              >
                {todo.done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
              </button>
              <span className={cn('min-w-0 flex-1 text-sm', todo.done && 'text-muted-foreground line-through')}>{todo.text}</span>
              <button
                type="button"
                onClick={() => remove(todo._id)}
                className="shrink-0 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

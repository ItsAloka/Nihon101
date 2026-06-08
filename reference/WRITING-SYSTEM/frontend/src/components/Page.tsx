/* NOT BAGEL — page shell. One hydrated island per route: Header + view +
 * Footer + Toaster, sharing a single likes/saves store. The Astro page picks
 * the route; navigation between routes is real URL navigation (see lib/store). */
import { useEffect } from 'react';
import { Header } from './Header';
import { Footer } from './Footer';
import { Toaster } from './ui';
import { HomeView } from './views/HomeView';
import { CategoryView } from './views/CategoryView';
import { SearchView } from './views/SearchView';
import { ArticleView } from './views/ArticleView';
import { EditorView } from './views/EditorView';
import { ProfileView } from './views/ProfileView';
import { AuthView } from './views/AuthView';
import { useStore, nav, type Route } from '../lib/store';
import { bootstrapAuth } from '../lib/authStore';

export default function Page({ route }: { route: Route }) {
  const store = useStore();

  // Restore any existing session once on load (silent refresh).
  useEffect(() => { bootstrapAuth(); }, []);

  // "/" focuses search, matching the prototype.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (e.key === '/' && tag !== 'input' && tag !== 'textarea') {
        e.preventDefault();
        nav('search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  let view;
  switch (route.view) {
    case 'category': view = <CategoryView catId={route.arg!} store={store} />; break;
    case 'article': view = <ArticleView postId={route.arg!} store={store} />; break;
    case 'editor': view = <EditorView />; break;
    case 'profile': view = <ProfileView userId={route.arg ?? 'you'} store={store} />; break;
    case 'search': view = <SearchView store={store} />; break;
    case 'auth': view = <AuthView />; break;
    default: view = <HomeView store={store} />;
  }

  return (
    <>
      <Header route={route} />
      <main className="app">{view}</main>
      <Footer />
      <Toaster />
    </>
  );
}

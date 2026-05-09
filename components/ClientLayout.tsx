'use client';

import { useStore } from '@/store/useStore';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, type MouseEvent } from 'react';
import { LogOut, CheckSquare, Settings, FileSpreadsheet, Users, LayoutDashboard, Database, ListTodo, KeyRound, Sparkles, Menu, MessagesSquare, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const ROUTE_WARMUP_PATHS = [
  '/login',
  '/admin',
  '/admin/questions',
  '/admin/configs',
  '/admin/records',
  '/admin/records/__warmup__',
  '/admin/feishu',
  '/admin/ai-apps',
  '/admin/ai-training',
  '/admin/ai-training/records',
  '/admin/users',
  '/student',
  '/student/records',
  '/student/exam/__warmup__',
  '/student/exam/__warmup__/result',
];

const warmedRoutes = new Set<string>();

function warmDevelopmentRoutes(paths: string[]) {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') {
    return;
  }

  const pendingPaths = paths.filter((path) => !warmedRoutes.has(path));
  if (pendingPaths.length === 0) {
    return;
  }

  pendingPaths.forEach((path) => warmedRoutes.add(path));
  window.setTimeout(() => {
    pendingPaths.forEach((path) => {
      void fetch(path, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'force-cache',
      }).catch(() => undefined);
    });
  }, 500);
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const {
    currentUser,
    isDataLoaded,
    loadData,
    refreshData,
    setCurrentUser,
    updateUser,
  } = useStore();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isPwdOpen, setIsPwdOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (mounted && isDataLoaded) {
      if (isSigningOut) {
        if (pathname === '/login') {
          setCurrentUser(null);
          setIsSigningOut(false);
        }
        return;
      }

      if (!currentUser && pathname !== '/login') {
        router.push('/login');
      } else if (currentUser && pathname === '/login') {
        router.push(currentUser.role === 'admin' ? '/admin' : '/student');
      } else if (currentUser) {
        if (pathname.startsWith('/admin') && currentUser.role !== 'admin') {
          router.push('/student');
        }
      }
    }
  }, [currentUser, isDataLoaded, isSigningOut, pathname, router, mounted, setCurrentUser]);

  useEffect(() => {
    if (!mounted || !isDataLoaded || !currentUser) {
      return;
    }

    ROUTE_WARMUP_PATHS.forEach((path) => router.prefetch(path));
    warmDevelopmentRoutes(ROUTE_WARMUP_PATHS);
  }, [currentUser, isDataLoaded, mounted, router]);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  if (!mounted || !isDataLoaded) {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (!currentUser || pathname === '/login' || pathname.match(/^\/admin\/ai-apps\/.+/)) return <>{children}</>;

  const adminNavGroups = [
    {
      title: '核心',
      items: [
        { name: '仪表盘', href: '/admin', icon: LayoutDashboard },
      ]
    },
    {
      title: '培训考试',
      items: [
        { name: '我的考试', href: '/student', icon: ListTodo },
        { name: '考试记录', href: '/student/records', icon: CheckSquare },
        { name: '题库管理', href: '/admin/questions', icon: Database },
        { name: '考试配置', href: '/admin/configs', icon: Settings },
        { name: '成绩管理', href: '/admin/records', icon: FileSpreadsheet },
      ]
    },
    {
      title: 'AI',
      items: [
        { name: '飞书应用', href: '/admin/ai-apps', icon: Sparkles },
        { name: '情景训练', href: '/admin/ai-training', icon: MessagesSquare },
        { name: '训练记录', href: '/admin/ai-training/records', icon: ClipboardList },
      ]
    },
    {
      title: '管理模块',
      items: [
        { name: '飞书设置', href: '/admin/feishu', icon: Settings },
        { name: '员工管理', href: '/admin/users', icon: Users },
      ]
    }
  ];

  const studentNavGroups = [
    {
      title: '员工视图',
      items: [
        { name: '我的考试', href: '/student', icon: ListTodo },
        { name: '考试记录', href: '/student/records', icon: CheckSquare },
      ]
    }
  ];

  const navGroups = currentUser.role === 'admin' ? adminNavGroups : studentNavGroups;

  const handleLogout = () => {
    setIsSigningOut(true);
    router.replace('/login');
  };

  const handleNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    afterNavigate?: () => void
  ) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    afterNavigate?.();
    if (pathname !== href) {
      router.push(href);
    } else {
      router.refresh();
    }

    void refreshData().finally(() => {
      router.refresh();
    });
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) {
      toast.error('请填写完整密码');
      return;
    }
    const currentPwd = currentUser.password || (currentUser.role === 'admin' ? 'admin123' : 'user123');
    if (oldPassword !== currentPwd) {
      toast.error('原密码不正确');
      return;
    }
    await updateUser({ ...currentUser, password: newPassword });
    toast.success('密码修改成功，请重新登录');
    setIsPwdOpen(false);
    setIsSigningOut(true);
    router.replace('/login');
  };

  const isActiveHref = (href: string) =>
    pathname === href ||
    (href !== '/admin' && href !== '/student' ? pathname.startsWith(`${href}/`) : false);

  const activeNavItem = navGroups.flatMap((group) => group.items).find((item) => isActiveHref(item.href));

  const renderBrand = () => (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded bg-orange-500 font-bold text-white shadow-lg">
        H
      </div>
      <h1 className="text-lg font-bold tracking-tight text-white">Haven平台管理</h1>
    </div>
  );

  const renderNavGroups = (onNavigate?: () => void) => (
    <>
      {navGroups.map((group, idx) => (
        <div key={idx} className="space-y-1">
          {group.title !== '核心' && (
            <div className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </div>
          )}
          {group.items.map((item) => {
            const isActive = isActiveHref(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={(event) => handleNavClick(event, item.href, onNavigate)}
                aria-current={isActive ? 'page' : undefined}
                className={`group flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    isActive ? 'text-white opacity-100' : 'opacity-70 group-hover:opacity-100'
                  }`}
                />
                {item.name}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );

  const renderUserPanel = () => (
    <div className="border-t border-slate-800 p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
          {currentUser.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-white">{currentUser.name}</p>
          <p className="text-[10px] capitalize text-slate-400">
            {currentUser.role === 'admin' ? '系统管理员' : '培训员工'}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setIsPwdOpen(true)}
          className="h-9 flex-1 justify-center border-slate-700 bg-transparent py-1.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
        >
          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          修改密码
        </Button>
        <Button
          variant="outline"
          className="h-9 flex-1 justify-center border-slate-700 bg-transparent py-1.5 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
          onClick={handleLogout}
          disabled={isSigningOut}
        >
          <LogOut className="mr-1.5 h-3.5 w-3.5" />
          {isSigningOut ? '退出中' : '退出登录'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-slate-50 text-slate-900 md:h-screen md:flex-row">
      <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsMobileNavOpen(true)}
          aria-label="打开菜单"
          className="-ml-2"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold text-slate-900">{activeNavItem?.name ?? 'Haven平台管理'}</p>
          <p className="truncate text-[11px] text-slate-500">{currentUser.name}</p>
        </div>
        <div className="h-9 w-9" aria-hidden="true" />
      </header>

      {isMobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="关闭菜单"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setIsMobileNavOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[82vw] max-w-80 flex-col bg-[#0F172A] shadow-2xl">
            <div className="p-5">{renderBrand()}</div>
            <nav className="app-scrollbar-dark flex-1 space-y-4 overflow-y-auto px-4 py-2">
              {renderNavGroups(() => setIsMobileNavOpen(false))}
            </nav>
            {renderUserPanel()}
          </aside>
        </div>
      )}

      <aside className="hidden w-64 flex-shrink-0 flex-col bg-[#0F172A] md:flex">
        <div className="p-6">{renderBrand()}</div>
        <nav className="app-scrollbar-dark flex-1 space-y-4 overflow-y-auto px-4 py-2">
          {renderNavGroups()}
        </nav>
        {renderUserPanel()}
      </aside>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-50">
        {children}
      </main>
      <Dialog open={isPwdOpen} onOpenChange={(open) => {
        setIsPwdOpen(open);
        if (open) {
          setOldPassword('');
          setNewPassword('');
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="oldPwd" className="sm:text-right">
                原密码
              </Label>
              <Input
                id="oldPwd"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="sm:col-span-3"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-4 sm:items-center sm:gap-4">
              <Label htmlFor="newPwd" className="sm:text-right">
                新密码
              </Label>
              <Input
                id="newPwd"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="sm:col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPwdOpen(false)}>取消</Button>
            <Button type="submit" onClick={handleChangePassword} className="bg-orange-600 hover:bg-orange-700">确认修改</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

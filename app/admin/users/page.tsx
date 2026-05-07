'use client';

import { useState } from 'react';
import { useStore, User } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

export default function UsersPage() {
  const { users, currentUser, addUser, updateUser } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('user123'); // default password

  const handleAddUser = () => {
    if (!newUsername || !newName) {
      toast.error('请填写完整信息');
      return;
    }
    
    // Check if user already exists
    if (users.find(u => u.username === newUsername)) {
      toast.error('用户名已存在');
      return;
    }

    const newUser: User = {
      id: `u_${new Date().getTime()}`,
      username: newUsername,
      name: newName,
      role: 'student',
      password: newPassword,
    };

    addUser(newUser);
    toast.success('员工添加成功');
    setIsAddOpen(false);
    setNewUsername('');
    setNewName('');
    setNewPassword('user123');
  };

  const visibleUsers = users.filter(u =>
    (u.name.includes(searchTerm) || u.username.includes(searchTerm))
  );
  const adminCount = users.filter((user) => user.role === 'admin').length;

  const handleToggleRole = async (user: User) => {
    const nextRole = user.role === 'admin' ? 'student' : 'admin';
    if (user.role === 'admin' && adminCount <= 1) {
      toast.error('至少需要保留一个管理员');
      return;
    }

    await updateUser({
      ...user,
      role: nextRole,
    });
    toast.success(nextRole === 'admin' ? '已设为管理员' : '已改为员工');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
        <h2 className="text-lg font-semibold">员工管理</h2>
      </header>

      <div className="flex-1 p-6 flex flex-col overflow-hidden space-y-4">
        <div className="flex justify-between items-center mb-2">
          <div className="relative w-64">
             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
             <Input 
               placeholder="搜索姓名或账号..." 
               className="pl-9 bg-white"
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>
          <div className="text-sm text-slate-500">
            共 {visibleUsers.length} 人，管理员 {adminCount} 人
          </div>
          
          <Button onClick={() => setIsAddOpen(true)} className="bg-orange-600 hover:bg-orange-700">
            <UserPlus className="mr-2 h-4 w-4" /> 添加员工
          </Button>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>添加新员工</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">
                    姓名
                  </Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="col-span-3"
                    placeholder="例如: 张三"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="username" className="text-right">
                    账号
                  </Label>
                  <Input
                    id="username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="col-span-3"
                    placeholder="登录用账号"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="password" className="text-right text-slate-500">
                    默认密码
                  </Label>
                  <Input
                    id="password"
                    value={newPassword}
                    className="col-span-3 text-slate-500 bg-slate-50"
                    disabled
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>取消</Button>
                <Button type="submit" onClick={handleAddUser} className="bg-orange-600 hover:bg-orange-700">保存</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-auto bg-white rounded-xl shadow-sm border border-slate-200">
          <Table>
            <TableHeader className="bg-slate-50 sticky top-0 z-10">
              <TableRow>
                <TableHead>姓名</TableHead>
                <TableHead>登录账号</TableHead>
                <TableHead>角色</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-10 text-slate-500">
                    暂无匹配的用户
                  </TableCell>
                </TableRow>
              ) : (
                visibleUsers.map((u) => (
                  <TableRow key={u.id} className="hover:bg-slate-50 transition-colors">
                    <TableCell className="font-medium text-slate-700">{u.name}</TableCell>
                    <TableCell className="text-slate-500">{u.username}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          u.role === 'admin'
                            ? 'bg-orange-100 text-orange-700 hover:bg-orange-100'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-100'
                        }
                      >
                        {u.role === 'admin' ? '管理员' : '员工'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleToggleRole(u)}
                        disabled={u.id === currentUser?.id || (u.role === 'admin' && adminCount <= 1)}
                      >
                        {u.role === 'admin' ? '改为员工' : '设为管理员'}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600">重置密码</Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

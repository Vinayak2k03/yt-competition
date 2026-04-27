import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel,
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Activity, 
  Video, 
  Key, 
  Youtube, 
  User, 
  LogOut, 
  Settings,
  Menu
} from 'lucide-react';

export function AppNavigation() {
  const location = useLocation();

  const navItems = [
    { href: '/', label: 'Live', icon: Activity },
    { href: '/vod', label: 'VOD', icon: Video },
  ];

  const adminItems = [
    { href: '/api-keys', label: 'API Keys', icon: Key },
    { href: '/channels', label: 'Channels', icon: Youtube },
  ];

  const isActive = (href: string) => location.pathname === href;

  return (
    <header className="border-b border-border bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-14 items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-primary-foreground">YT</span>
              </div>
              <span className="font-semibold hidden sm:inline">YouTube Radar</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} to={item.href}>
                  <Button 
                    variant={isActive(item.href) ? 'secondary' : 'ghost'} 
                    size="sm"
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Mobile nav items */}
                  <div className="md:hidden">
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <DropdownMenuItem key={item.href} asChild>
                          <Link to={item.href} className="gap-2">
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                  </div>
                  
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Admin
                  </DropdownMenuLabel>
                  {adminItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link to={item.href} className="gap-2">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}

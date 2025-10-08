import React, { ComponentType, lazy, Suspense } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Route configuration interface
 */
export interface RouteConfig {
  path: string;
  component: ComponentType<any>;
  exact?: boolean;
  protected?: boolean;
  roles?: string[];
  redirectTo?: string;
  fallback?: ComponentType<any>;
  preload?: () => Promise<any>;
}

/**
 * Navigation guard interface
 */
export interface NavigationGuard {
  canActivate: (location: any, user: any) => boolean | Promise<boolean>;
  redirectTo?: string;
  message?: string;
}

/**
 * Route metadata interface
 */
export interface RouteMetadata {
  title: string;
  description?: string;
  keywords?: string[];
  requiresAuth?: boolean;
  roles?: string[];
  layout?: string;
}

/**
 * Enhanced route configuration with metadata
 */
export interface EnhancedRouteConfig extends RouteConfig {
  metadata?: RouteMetadata;
  guards?: NavigationGuard[];
  children?: EnhancedRouteConfig[];
}

/**
 * Hook for route-based code splitting with preloading
 */
export function useRoutePreloader() {
  const preloadRoute = React.useCallback((preloadFn: () => Promise<any>) => {
    // Preload the route when user hovers over navigation links
    return preloadFn();
  }, []);

  const preloadOnHover = React.useCallback((preloadFn: () => Promise<any>) => {
    return () => preloadRoute(preloadFn);
  }, [preloadRoute]);

  return { preloadRoute, preloadOnHover };
}

/**
 * Higher-order component for route-based code splitting
 */
export function withRouteSplitting<T extends object>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  fallback?: ComponentType
) {
  const LazyComponent = lazy(importFn);

  return function RouteSplitComponent(props: T) {
    return (
      <Suspense fallback={fallback ? React.createElement(fallback) : <DefaultRouteFallback />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

/**
 * Default fallback component for route loading
 */
const DefaultRouteFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '50vh',
    gap: '1rem'
  }}>
    <div style={{
      width: '40px',
      height: '40px',
      border: '4px solid #e5e7eb',
      borderTop: '4px solid #4f46e5',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    }}></div>
    <p style={{ color: '#6b7280', fontSize: '1rem' }}>Loading...</p>
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
);

/**
 * Hook for route metadata management
 */
export function useRouteMetadata() {
  const location = useLocation();

  const updateMetadata = React.useCallback((metadata: RouteMetadata) => {
    // Update document title
    if (metadata.title) {
      document.title = `${metadata.title} - Xiotein School`;
    }

    // Update meta description
    if (metadata.description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute('content', metadata.description);
    }

    // Update meta keywords
    if (metadata.keywords && metadata.keywords.length > 0) {
      let metaKeywords = document.querySelector('meta[name="keywords"]');
      if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.setAttribute('name', 'keywords');
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute('content', metadata.keywords.join(', '));
    }
  }, []);

  const clearMetadata = React.useCallback(() => {
    document.title = 'Xiotein School - Manifestation Game';
  }, []);

  return { updateMetadata, clearMetadata, currentPath: location.pathname };
}

/**
 * Hook for navigation guards
 */
export function useNavigationGuards() {
  const location = useLocation();

  const checkGuards = React.useCallback(async (
    guards: NavigationGuard[],
    user: any
  ): Promise<{ canActivate: boolean; redirectTo?: string; message?: string }> => {
    for (const guard of guards) {
      const canActivate = await guard.canActivate(location, user);
      if (!canActivate) {
        return {
          canActivate: false,
          redirectTo: guard.redirectTo,
          message: guard.message
        };
      }
    }
    return { canActivate: true };
  }, [location]);

  return { checkGuards };
}

/**
 * Protected route component
 */
export const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  user: any;
  roles?: string[];
  redirectTo?: string;
  fallback?: React.ReactNode;
}> = ({ children, user, roles, redirectTo = '/login', fallback }) => {
  // Check if user is authenticated
  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  // Check if user has required roles
  if (roles && roles.length > 0) {
    // For scorekeeper routes, we need to check the actual user roles from Firestore
    // This is a simplified check - the actual role checking happens in the component
    // We'll allow the component to handle the detailed role checking
    console.log('🔍 ProtectedRoute: Checking roles for user:', user, 'required roles:', roles);
    
    // If this is a scorekeeper route, let the component handle the role checking
    if (roles.includes('scorekeeper') || roles.includes('admin')) {
      console.log('✅ ProtectedRoute: Allowing scorekeeper/admin route to load component for role checking');
      return <>{children}</>;
    }
    
    // For other roles, use the simple check
    const userRole = user.role || 'user';
    if (!roles.includes(userRole)) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '50vh',
          gap: '1rem',
          padding: '2rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '4rem' }}>🚫</div>
          <h2 style={{ color: '#ef4444', margin: 0 }}>Access Denied</h2>
          <p style={{ color: '#6b7280', margin: 0 }}>
            You don't have permission to access this page.
          </p>
          <button
            onClick={() => window.history.back()}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '500',
              marginTop: '1rem'
            }}
          >
            Go Back
          </button>
        </div>
      );
    }
  }

  return <>{children}</>;
};

/**
 * Route transition component
 */
export const RouteTransition: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = 'page-transition' }) => {
  return (
    <div className={className}>
      {children}
    </div>
  );
};

/**
 * Hook for route analytics
 */
export function useRouteAnalytics() {
  const location = useLocation();

  const trackPageView = React.useCallback((path: string, title?: string) => {
    // Track page view for analytics
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('config', 'GA_MEASUREMENT_ID', {
        page_path: path,
        page_title: title || document.title
      });
    }

    // Log route change for debugging
    console.log(`Route changed to: ${path}`);
  }, []);

  React.useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname, trackPageView]);

  return { trackPageView };
}

/**
 * Hook for route-based breadcrumbs
 */
export function useBreadcrumbs() {
  const location = useLocation();

  const generateBreadcrumbs = React.useCallback((path: string) => {
    const segments = path.split('/').filter(Boolean);
    const breadcrumbs = segments.map((segment, index) => {
      const path = '/' + segments.slice(0, index + 1).join('/');
      const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
      
      return {
        label,
        path,
        isLast: index === segments.length - 1
      };
    });

    return breadcrumbs;
  }, []);

  const breadcrumbs = React.useMemo(() => 
    generateBreadcrumbs(location.pathname), 
    [location.pathname, generateBreadcrumbs]
  );

  return { breadcrumbs };
}

/**
 * Hook for route-based scroll restoration
 */
export function useScrollRestoration() {
  const location = useLocation();

  React.useEffect(() => {
    // Restore scroll position for the current route
    const savedPosition = sessionStorage.getItem(`scroll-${location.pathname}`);
    if (savedPosition) {
      window.scrollTo(0, parseInt(savedPosition));
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname]);

  React.useEffect(() => {
    // Save scroll position when leaving a route
    const handleBeforeUnload = () => {
      sessionStorage.setItem(`scroll-${location.pathname}`, window.scrollY.toString());
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [location.pathname]);
}

/**
 * Hook for route-based error boundaries
 */
export function useRouteErrorBoundary() {
  const [error, setError] = React.useState<Error | null>(null);
  const location = useLocation();

  React.useEffect(() => {
    // Clear error when route changes
    setError(null);
  }, [location.pathname]);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  return { error, setError, resetError };
}

/**
 * Route configuration builder
 */
export class RouteBuilder {
  private routes: EnhancedRouteConfig[] = [];

  addRoute(config: EnhancedRouteConfig): RouteBuilder {
    this.routes.push(config);
    return this;
  }

  addProtectedRoute(
    path: string,
    component: ComponentType<any>,
    roles?: string[],
    metadata?: RouteMetadata
  ): RouteBuilder {
    return this.addRoute({
      path,
      component,
      protected: true,
      roles,
      metadata
    });
  }

  addPublicRoute(
    path: string,
    component: ComponentType<any>,
    metadata?: RouteMetadata
  ): RouteBuilder {
    return this.addRoute({
      path,
      component,
      protected: false,
      metadata
    });
  }

  build(): EnhancedRouteConfig[] {
    return this.routes;
  }
}

/**
 * Utility for creating route configurations
 */
export const createRouteConfig = (
  path: string,
  component: ComponentType<any>,
  options: Partial<EnhancedRouteConfig> = {}
): EnhancedRouteConfig => ({
  path,
  component,
  exact: true,
  protected: false,
  ...options
});

/**
 * Utility for creating protected route configurations
 */
export const createProtectedRoute = (
  path: string,
  component: ComponentType<any>,
  roles?: string[],
  options: Partial<EnhancedRouteConfig> = {}
): EnhancedRouteConfig => ({
  path,
  component,
  exact: true,
  protected: true,
  roles,
  ...options
});

/**
 * Utility for creating lazy route configurations
 */
export const createLazyRoute = (
  path: string,
  importFn: () => Promise<{ default: ComponentType<any> }>,
  options: Partial<EnhancedRouteConfig> = {}
): EnhancedRouteConfig => ({
  path,
  component: withRouteSplitting(importFn),
  exact: true,
  protected: false,
  ...options
});

/**
 * Utility for creating lazy protected route configurations
 */
export const createLazyProtectedRoute = (
  path: string,
  importFn: () => Promise<{ default: ComponentType<any> }>,
  roles?: string[],
  options: Partial<EnhancedRouteConfig> = {}
): EnhancedRouteConfig => ({
  path,
  component: withRouteSplitting(importFn),
  exact: true,
  protected: true,
  roles,
  ...options
});

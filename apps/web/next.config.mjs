const nextConfig = {
  async rewrites() {
    return [
      { source: '/static/data/santa_route.json', destination: '/api/route' },
      { source: '/data/santa_route.json', destination: '/api/route' },
    ];
  },
};

export default nextConfig;

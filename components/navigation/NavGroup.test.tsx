import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavGroup, type NavChild } from './NavGroup';
import { Home } from 'lucide-react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const items: NavChild[] = [
  { to: '/a', label: 'Item A', icon: Home },
  { to: '/b', label: 'Item B', icon: Home },
];

describe('NavGroup', () => {
  it('renderiza itens e marca ativo pelo caminho', () => {
    render(
      <NavGroup
        label="Grupo"
        icon={Home}
        items={items}
        activePath="/b"
        collapsed={false}
      />
    );

    expect(screen.getByText('Grupo')).toBeInTheDocument();
    expect(screen.getByText('Item A')).toBeInTheDocument();
    const active = screen.getByText('Item B').closest('a');
    expect(active).toHaveAttribute('data-active', 'true');
  });

  it('permite expandir e mostrar itens', () => {
    render(
      <NavGroup
        label="Grupo"
        icon={Home}
        items={items}
        activePath="/none"
        collapsed={false}
      />
    );

    const toggle = screen.getByRole('button', { name: /grupo/i });
    expect(screen.queryByText('Item A')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Item A')).toBeInTheDocument();
  });

  it('mostra placeholder quando não há itens', () => {
    render(
      <NavGroup
        label="Vazio"
        icon={Home}
        items={[]}
        activePath="/"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /vazio/i }));
    expect(screen.getByText('Sem itens disponíveis')).toBeInTheDocument();
  });
});

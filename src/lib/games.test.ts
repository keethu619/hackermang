import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllCategories,
    getAllGames,
    getAllGameIds,
    getGameById,
    getAllPublishers,
    getFilteredGames,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({ id: expect.any(Number), name: 'Strategy' });
        expect(all[0].publisher).toEqual({ id: expect.any(Number), name: 'Pub One' });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('returns categories and publishers in alphabetical order', async () => {
        await db.insert(categories).values([
            { name: 'Tactics', description: 'cat' },
            { name: 'Adventure', description: 'cat' },
        ]);
        await db.insert(publishers).values([
            { name: 'Zed Games', description: 'pub' },
            { name: 'Alpha Games', description: 'pub' },
        ]);

        expect((await getAllCategories(db)).map((category) => category.name)).toEqual([
            'Adventure',
            'Tactics',
        ]);
        expect((await getAllPublishers(db)).map((publisher) => publisher.name)).toEqual([
            'Alpha Games',
            'Zed Games',
        ]);
    });

    it('filters by any selected category and the selected publisher', async () => {
        const [strategy, adventure] = await db
            .insert(categories)
            .values([
                { name: 'Strategy', description: 'cat' },
                { name: 'Adventure', description: 'cat' },
            ])
            .returning({ id: categories.id });
        const [pubOne, pubTwo] = await db
            .insert(publishers)
            .values([
                { name: 'Pub One', description: 'pub' },
                { name: 'Pub Two', description: 'pub' },
            ])
            .returning({ id: publishers.id });
        await db.insert(games).values([
            {
                title: 'Strategy One',
                description: 'game',
                starRating: 4,
                categoryId: strategy.id,
                publisherId: pubOne.id,
            },
            {
                title: 'Adventure One',
                description: 'game',
                starRating: 4,
                categoryId: adventure.id,
                publisherId: pubOne.id,
            },
            {
                title: 'Strategy Two',
                description: 'game',
                starRating: 4,
                categoryId: strategy.id,
                publisherId: pubTwo.id,
            },
        ]);

        const categoryMatches = await getFilteredGames(db, {
            categoryIds: [strategy.id, adventure.id],
        });
        expect(categoryMatches.map((game) => game.title)).toEqual([
            'Adventure One',
            'Strategy One',
            'Strategy Two',
        ]);

        const combinedMatches = await getFilteredGames(db, {
            categoryIds: [strategy.id, adventure.id],
            publisherId: pubOne.id,
        });
        expect(combinedMatches.map((game) => game.title)).toEqual([
            'Adventure One',
            'Strategy One',
        ]);
    });

    it('returns no games for a filter with no matches', async () => {
        await seedGames(db, 1);
        expect(await getFilteredGames(db, { publisherId: 99999 })).toEqual([]);
    });
});

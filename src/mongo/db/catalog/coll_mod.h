/**
 *    Copyright (C) 2015 MongoDB Inc.
 *
 *    This program is free software: you can redistribute it and/or  modify
 *    it under the terms of the GNU Affero General Public License, version 3,
 *    as published by the Free Software Foundation.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Affero General Public License for more details.
 *
 *    You should have received a copy of the GNU Affero General Public License
 *    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *    As a special exception, the copyright holders give permission to link the
 *    code of portions of this program with the OpenSSL library under certain
 *    conditions as described in each individual source file and distribute
 *    linked combinations including the program with the OpenSSL library. You
 *    must comply with the GNU Affero General Public License in all respects for
 *    all of the code used other than as permitted herein. If you modify file(s)
 *    with this exception, you may extend this exception to your version of the
 *    file(s), but you are not obligated to do so. If you do not wish to do so,
 *    delete this exception statement from your version. If you delete this
 *    exception statement from all source files in the program, then also delete
 *    it in the license file.
 */

#include "mongo/base/status.h"
#include "mongo/base/status_with.h"
#include "mongo/db/catalog/collection_options.h"

namespace mongo {
class BSONObj;
class BSONObjBuilder;
class Collection;
class NamespaceString;
class OperationContext;

/**
 * Adds UUIDs to all replicated collections of all databases if they do not already have UUIDs. If
 * this function is not necessary for SERVER-33247, it can be removed.
 */
void addCollectionUUIDs(OperationContext* opCtx);

/**
 * Performs the collection modification described in "cmdObj" on the collection "ns".
 */
Status collMod(OperationContext* opCtx,
               const NamespaceString& ns,
               const BSONObj& cmdObj,
               BSONObjBuilder* result);

/**
 * Updates version of unique indexes belonging to collection "nss". This is called during
 * upgrade to 4.0.
 */
Status collModForUniqueIndexUpgrade(OperationContext* opCtx,
                                    const NamespaceString& nss,
                                    const BSONObj& cmdObj);
/*
 * Adds uuid to the collection "ns" if the collection does not already have a UUID.
 * This is called if a collection failed to be assigned a UUID during upgrade to 3.6.
 */
Status collModForUUIDUpgrade(OperationContext* opCtx,
                             const NamespaceString& ns,
                             const BSONObj& cmdObj,
                             CollectionUUID uuid);

/*
 * Updates unique index version in catalog.
 */
void updateUniqueIndexVersionOnUpgrade(OperationContext* opCtx);

}  // namespace mongo
